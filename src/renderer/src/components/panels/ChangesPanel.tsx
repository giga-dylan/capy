import { useCallback, useEffect, useState } from 'react'
import { DiffView } from './DiffView'

interface FileChange {
  file?: string
  patch?: string
  additions: number
  deletions: number
  status?: 'added' | 'deleted' | 'modified'
}

/**
 * What changed: this chat's edits (opencode session.diff, from its snapshots) and the folder's
 * uncommitted git changes (vcs.diff). Refreshes as the agent edits files.
 */
export function ChangesPanel({ directory, sessionId, isGit }: { directory: string; sessionId?: string; isGit: boolean }): React.JSX.Element {
  const [tab, setTab] = useState<'chat' | 'git'>(sessionId ? 'chat' : 'git')
  const [changes, setChanges] = useState<FileChange[]>()
  // opencode records changes per request: session.diff needs the user message id.
  const [turns, setTurns] = useState<{ id: string; text: string; files: FileChange[] }[]>()
  const [error, setError] = useState<string>()

  const load = useCallback(() => {
    setError(undefined)
    if (tab === 'git') {
      window.api
        .oc<FileChange[]>('vcs.diff', { directory, mode: 'git' })
        .then((c) => setChanges(c ?? []))
        .catch((err) => setError(String(err)))
      return
    }
    if (!sessionId) return setTurns([])
    window.api
      .getMessages(directory, sessionId)
      .then(async (messages) => {
        const users = messages.filter((m) => m.info.role === 'user')
        const result = await Promise.all(
          users.map(async (m) => ({
            id: m.info.id,
            text: m.parts
              .map((p) => (p.type === 'text' && !p.synthetic ? p.text : ''))
              .join(' ')
              .trim(),
            files: (await window.api.oc<FileChange[]>('session.diff', { directory, sessionID: sessionId, messageID: m.info.id })) ?? []
          }))
        )
        setTurns(result.filter((t) => t.files.length).reverse())
        setChanges(result.flatMap((t) => t.files))
      })
      .catch((err) => setError(String(err)))
  }, [tab, directory, sessionId])

  useEffect(() => {
    load()
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = window.api.onAgentEvent((d, e) => {
      if (d !== directory || !['session.diff', 'file.edited', 'session.idle', 'session.updated'].includes(e.type)) return
      clearTimeout(timer)
      timer = setTimeout(load, 400)
    })
    return () => {
      clearTimeout(timer)
      off()
    }
  }, [load, directory])

  const total = (changes ?? []).reduce((acc, c) => ({ add: acc.add + c.additions, del: acc.del + c.deletions }), { add: 0, del: 0 })
  const tabCls = (on: boolean): string =>
    `rounded-md px-2 py-1 text-xs ${on ? 'bg-neutral-200 font-medium dark:bg-neutral-800' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'}`

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 px-3 pb-2">
        {sessionId && (
          <button onClick={() => setTab('chat')} className={tabCls(tab === 'chat')}>
            This chat
          </button>
        )}
        {isGit && (
          <button onClick={() => setTab('git')} className={tabCls(tab === 'git')}>
            Uncommitted (git)
          </button>
        )}
        <span className="flex-1" />
        {changes && changes.length > 0 && (
          <span className="font-mono text-xs">
            <span className="text-emerald-500">+{total.add}</span> <span className="text-red-500">−{total.del}</span>
          </span>
        )}
      </div>
      <div className="selectable min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {error && <p className="text-xs text-red-500">{error}</p>}
        {!sessionId && !isGit && <p className="text-xs text-neutral-500">Changes show up here once the agent edits files in this chat.</p>}
        {changes?.length === 0 && (sessionId || isGit) && (
          <p className="text-xs text-neutral-500">{tab === 'chat' ? 'This chat hasn’t changed any files yet.' : 'No uncommitted changes.'}</p>
        )}
        {tab === 'chat'
          ? turns?.map((t) => (
              <section key={t.id} className="space-y-1.5">
                <p className="truncate text-xs text-neutral-500" title={t.text}>
                  “{t.text || 'Request'}”
                </p>
                <FileList files={t.files} />
              </section>
            ))
          : changes && <FileList files={changes} />}
      </div>
    </div>
  )
}

function FileList({ files }: { files: FileChange[] }): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      {files.map((c) => (
        <details key={c.file} className="rounded-md border border-neutral-200 dark:border-neutral-800">
          <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs">
            <span className={c.status === 'added' ? 'text-emerald-500' : c.status === 'deleted' ? 'text-red-500' : 'text-amber-500'}>
              {c.status === 'added' ? 'A' : c.status === 'deleted' ? 'D' : 'M'}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono" title={c.file}>
              {c.file}
            </span>
            <span className="font-mono text-emerald-500">+{c.additions}</span>
            <span className="font-mono text-red-500">−{c.deletions}</span>
          </summary>
          {c.patch ? (
            <DiffView patch={c.patch} />
          ) : (
            <p className="border-t border-neutral-200 p-2 text-xs text-neutral-500 dark:border-neutral-800">No diff available.</p>
          )}
        </details>
      ))}
    </div>
  )
}
