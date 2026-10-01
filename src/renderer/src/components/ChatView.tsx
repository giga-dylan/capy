import { useEffect, useRef, useState } from 'react'
import type { PermissionRequest } from '@opencode-ai/sdk/v2'
import type { PermissionResponse } from '@shared/types'
import { basename } from '../paths'
import { useInventory } from '../models'
import { useSession } from '../useSession'
import logo from '../assets/capy.svg'
import { ArrowUpIcon, CheckIcon, ChevronDownIcon, FolderIcon, PlusIcon, StopIcon } from './icons'
import { MessageView, PermissionCard } from './Messages'
import { EffortPicker } from './EffortPicker'
import { ModelPicker } from './ModelPicker'
import type { ActiveChat } from './Shell'

interface Props {
  chatsDir: string
  projects: string[]
  active: ActiveChat
  model: string
  /** Selected primary agent; undefined = opencode's default agent. */
  agent?: string
  onChangeAgent: (agent: string | undefined) => void
  onOpenSettings: () => void
  onChangeDirectory: (dir: string) => void
  onAddProject: () => Promise<string | null>
  onSessionCreated: (sessionId: string) => void
}

export function ChatView(props: Props): React.JSX.Element {
  const { chatsDir, projects, active, model, agent, onChangeAgent, onOpenSettings, onChangeDirectory, onAddProject, onSessionCreated } = props
  const { directory, sessionId } = active
  const { messages, permissions, busy, error } = useSession(directory, sessionId)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string>()
  const bottom = useRef<HTMLDivElement>(null)
  const isProject = directory !== chatsDir
  const inventory = useInventory()
  // "/partial" with no space yet: suggest matching commands.
  const slash = /^\/(\S*)$/.exec(input)
  const suggestions = slash ? (inventory?.commands ?? []).filter((c) => c.name.startsWith(slash[1])).slice(0, 8) : []

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
        pendingPrompt.set(session.id, { text, agent })
        onSessionCreated(session.id)
        return
      }
      setInput('')
      await window.api.prompt(directory, sessionId, text, agent)
    } catch (err) {
      setSendError(String(err))
    } finally {
      setSending(false)
    }
  }

  // Send the first message of a just-created session (after useSession has subscribed).
  useEffect(() => {
    if (!sessionId) return
    const pending = pendingPrompt.get(sessionId)
    if (!pending) return
    pendingPrompt.delete(sessionId)
    window.api.prompt(directory, sessionId, pending.text, pending.agent).catch((err) => setSendError(String(err)))
  }, [directory, sessionId])

  const respond = (p: PermissionRequest, r: PermissionResponse): Promise<void> => window.api.respondPermission(directory, p.id, r)
  const empty = messages.length === 0 && !sessionId

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-neutral-950">
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
          {suggestions.length > 0 && (
            <ul className="border-b border-neutral-200 py-1 dark:border-neutral-800">
              {suggestions.map((c, i) => (
                <li key={c.name}>
                  <button
                    onClick={() => setInput(`/${c.name} `)}
                    className={`flex w-full items-baseline gap-3 px-4 py-1 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${i === 0 ? 'bg-neutral-100/70 dark:bg-neutral-800/60' : ''}`}
                  >
                    <span className="font-mono text-xs">/{c.name}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{c.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Tab completes the first suggested /command.
              if (e.key === 'Tab' && suggestions.length) {
                e.preventDefault()
                setInput(`/${suggestions[0].name} `)
                return
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            rows={2}
            placeholder={isProject ? `Ask anything about ${basename(directory)}… (/ for commands)` : 'Ask anything… (/ for commands)'}
            className="block max-h-60 w-full resize-none bg-transparent px-4 pt-3 text-sm outline-none [field-sizing:content] placeholder:text-neutral-400"
          />
          <div className="flex items-center gap-2 px-3 pb-3">
            <AgentPicker agents={(inventory?.agents ?? []).filter((a) => a.mode !== 'subagent' && !a.hidden)} agent={agent} onChange={onChangeAgent} />
            <span className="flex-1" />
            <ModelPicker model={model} onOpenSettings={onOpenSettings} />
            <EffortPicker model={model} />
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
const pendingPrompt = new Map<string, { text: string; agent?: string }>()

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

function AgentPicker({
  agents,
  agent,
  onChange
}: {
  agents: { name: string; description?: string }[]
  agent?: string
  onChange: (agent: string | undefined) => void
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (!agents.length) return null
  const current = agent ?? agents[0]?.name
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Agent"
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-500 capitalize hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
      >
        {current} <ChevronDownIcon className="size-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-lg border border-neutral-200 bg-white p-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            {agents.map((a) => (
              <MenuItem
                key={a.name}
                selected={a.name === current}
                onClick={() => {
                  setOpen(false)
                  onChange(a.name)
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block capitalize">{a.name}</span>
                  {a.description && <span className="block truncate text-xs text-neutral-500">{a.description}</span>}
                </span>
              </MenuItem>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
