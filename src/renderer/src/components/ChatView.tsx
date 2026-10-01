import { useEffect, useRef, useState } from 'react'
import type { PermissionRequest } from '@opencode-ai/sdk/v2'
import type { PermissionResponse } from '@shared/types'
import { basename } from '../paths'
import { useSession } from '../useSession'
import logo from '../assets/capy.svg'
import { ArrowUpIcon, CheckIcon, ChevronDownIcon, FolderIcon, PlusIcon, StopIcon } from './icons'
import { MessageView, PermissionCard } from './Messages'
import { ModelPicker } from './ModelPicker'
import type { ActiveChat } from './Shell'

interface Props {
  chatsDir: string
  projects: string[]
  active: ActiveChat
  model: string
  onOpenSettings: () => void
  onChangeDirectory: (dir: string) => void
  onAddProject: () => Promise<string | null>
  onSessionCreated: (sessionId: string) => void
}

export function ChatView({ chatsDir, projects, active, model, onOpenSettings, onChangeDirectory, onAddProject, onSessionCreated }: Props): React.JSX.Element {
  const { directory, sessionId } = active
  const { messages, permissions, busy, error } = useSession(directory, sessionId)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string>()
  const bottom = useRef<HTMLDivElement>(null)
  const isProject = directory !== chatsDir

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages, permissions])

  async function send(): Promise<void> {
    const text = input.trim()
    if (!text || busy || sending) return
    setSending(true)
    setSendError(undefined)
    try {
      // New chats get their session on the first message; the parent re-keys this view
      // with the new session id, and that instance's prompt is sent below.
      if (!sessionId) {
        const session = await window.api.createSession(directory)
        pendingPrompt.set(session.id, text)
        onSessionCreated(session.id)
        return
      }
      setInput('')
      await window.api.prompt(directory, sessionId, text)
    } catch (err) {
      setSendError(String(err))
    } finally {
      setSending(false)
    }
  }

  // Send the first message of a just-created session (after useSession has subscribed).
  useEffect(() => {
    if (!sessionId) return
    const text = pendingPrompt.get(sessionId)
    if (text === undefined) return
    pendingPrompt.delete(sessionId)
    window.api.prompt(directory, sessionId, text).catch((err) => setSendError(String(err)))
  }, [directory, sessionId])

  const respond = (p: PermissionRequest, r: PermissionResponse): Promise<void> => window.api.respondPermission(directory, p.id, r)
  const empty = messages.length === 0 && !sessionId

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-white dark:bg-neutral-950">
      <div className="drag h-12 shrink-0" />

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16">
          <img src={logo} alt="" className="size-20" />
          <h1 className="text-center text-2xl font-medium">
            {isProject ? (
              <>
                What should we work on in <span className="underline decoration-dotted underline-offset-4">{basename(directory)}</span>?
              </>
            ) : (
              'What should we work on?'
            )}
          </h1>
        </div>
      ) : (
        <div className="selectable min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-4 px-6 py-4">
            {messages.map((m) => (
              <MessageView key={m.id} message={m} />
            ))}
            {permissions.map((p) => (
              <PermissionCard key={p.id} permission={p} onRespond={(r) => respond(p, r)} />
            ))}
            {busy && <p className="animate-pulse text-sm text-neutral-500">Working…</p>}
            {(error || sendError) && <p className="text-sm text-red-500">{error ?? sendError}</p>}
            <div ref={bottom} />
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-6 pb-6">
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
            <FolderPicker
              chatsDir={chatsDir}
              projects={projects}
              directory={directory}
              locked={!!sessionId}
              onChange={onChangeDirectory}
              onAddProject={onAddProject}
            />
          </div>
          <textarea
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            rows={2}
            placeholder={isProject ? `Ask anything about ${basename(directory)}…` : 'Ask anything…'}
            className="block max-h-60 w-full resize-none bg-transparent px-4 pt-3 text-sm outline-none [field-sizing:content] placeholder:text-neutral-400"
          />
          <div className="flex items-center gap-2 px-3 pb-3">
            <span className="flex-1" />
            <ModelPicker model={model} onOpenSettings={onOpenSettings} />
            {busy ? (
              <button
                onClick={() => sessionId && window.api.abort(directory, sessionId)}
                title="Stop"
                className="grid size-8 place-items-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              >
                <StopIcon className="size-3.5" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim() || sending}
                title="Send (Enter)"
                className="grid size-8 place-items-center rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30"
              >
                <ArrowUpIcon />
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

/** First prompts for sessions created by a ChatView that's about to be replaced (re-keyed). */
const pendingPrompt = new Map<string, string>()

function FolderPicker({
  chatsDir,
  projects,
  directory,
  locked,
  onChange,
  onAddProject
}: {
  chatsDir: string
  projects: string[]
  directory: string
  locked: boolean
  onChange: (dir: string) => void
  onAddProject: () => Promise<string | null>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const label = directory === chatsDir ? 'No folder' : basename(directory)
  const chip = 'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-neutral-600 dark:text-neutral-300'

  // A chat's folder is fixed once it has started.
  if (locked) {
    return (
      <span className={chip} title={directory === chatsDir ? undefined : directory}>
        <FolderIcon className="size-3.5" /> {label}
      </span>
    )
  }

  const pick = (dir: string): void => {
    setOpen(false)
    onChange(dir)
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={`${chip} hover:bg-neutral-200 dark:hover:bg-neutral-800`}>
        <FolderIcon className="size-3.5" /> {label} <ChevronDownIcon className="size-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-lg border border-neutral-200 bg-white p-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <MenuItem selected={directory === chatsDir} onClick={() => pick(chatsDir)}>
              <span className="text-neutral-500">No folder</span>
            </MenuItem>
            {projects.map((dir) => (
              <MenuItem key={dir} selected={directory === dir} onClick={() => pick(dir)} title={dir}>
                <FolderIcon className="size-3.5 shrink-0" /> <span className="truncate">{basename(dir)}</span>
              </MenuItem>
            ))}
            <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
            <MenuItem
              onClick={async () => {
                setOpen(false)
                const dir = await onAddProject()
                if (dir) onChange(dir)
              }}
            >
              <PlusIcon className="size-3.5" /> Add folder…
            </MenuItem>
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({
  selected,
  onClick,
  title,
  children
}: {
  selected?: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button onClick={onClick} title={title} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800">
      {children}
      <span className="flex-1" />
      {selected && <CheckIcon className="size-3.5 text-blue-500" />}
    </button>
  )
}
