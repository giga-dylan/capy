import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@shared/types'
import { useSession } from '../../useSession'
import { MessageView, PermissionCard, QuestionCard } from '../Messages'

/**
 * Subagents a chat started (opencode session.children, created by the task tool), with a live,
 * read-only view of what each one is doing.
 */
export function AgentsPanel({ directory, sessionId, focus }: { directory: string; sessionId: string; focus?: string }): React.JSX.Element {
  const [children, setChildren] = useState<Session[]>()
  const [selected, setSelected] = useState<string | undefined>(focus)

  const load = useCallback(() => {
    window.api
      .oc<Session[]>('session.children', { directory, sessionID: sessionId })
      .then((c) => setChildren((c ?? []).sort((a, b) => b.time.created - a.time.created)))
      .catch(() => setChildren([]))
  }, [directory, sessionId])

  useEffect(() => {
    load()
    return window.api.onAgentEvent((_d, e) => (e.type === 'session.created' || e.type === 'session.updated') && load())
  }, [load])
  useEffect(() => setSelected(focus), [focus])

  if (selected) return <SubagentView directory={directory} sessionId={selected} title={children?.find((c) => c.id === selected)?.title} onBack={() => setSelected(undefined)} />

  return (
    <div className="selectable min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      {!children ? (
        <p className="text-xs text-neutral-500">Loading…</p>
      ) : children.length === 0 ? (
        <p className="text-xs text-neutral-500">No subagents yet. Agents start them (with the task tool) to handle focused jobs like exploring a codebase.</p>
      ) : (
        <ul className="space-y-1">
          {children.map((c) => (
            <li key={c.id}>
              <button onClick={() => setSelected(c.id)} className="w-full rounded-md border border-neutral-200 px-3 py-2 text-left text-xs hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                <span className="block truncate font-medium">{c.title || 'Subagent'}</span>
                <span className="text-neutral-500">{new Date(c.time.created).toLocaleTimeString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SubagentView({ directory, sessionId, title, onBack }: { directory: string; sessionId: string; title?: string; onBack: () => void }): React.JSX.Element {
  const { messages, permissions, questions, busy } = useSession(directory, sessionId)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pb-2">
        <button onClick={onBack} className="rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          ← All subagents
        </button>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
        {busy && <span className="animate-pulse text-xs text-amber-500">working</span>}
      </div>
      <div className="selectable min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-4">
        {messages.map((m) => (
          <MessageView key={m.id} message={m} />
        ))}
        {permissions.map((p) => (
          <PermissionCard key={p.id} permission={p} onRespond={(r) => window.api.respondPermission(directory, p.id, r)} />
        ))}
        {questions.map((q) => (
          <QuestionCard key={q.id} request={q} onAnswer={(a) => window.api.replyQuestion(directory, q.id, a)} onDismiss={() => window.api.rejectQuestion(directory, q.id)} />
        ))}
      </div>
    </div>
  )
}
