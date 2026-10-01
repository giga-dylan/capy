import { useEffect, useRef, useState } from 'react'
import type { PermissionRequest, Todo } from '@opencode-ai/sdk/v2'
import type { PermissionResponse } from '@shared/types'
import logo from '../assets/capy.svg'
import { useInventory } from '../models'
import { basename } from '../paths'
import { useSession } from '../useSession'
import { Composer, type Mention, type SendRequest } from './Composer'
import { BranchIcon, CheckIcon, ChevronDownIcon, CircleIcon, DiffIcon, FilesIcon, FolderIcon, PlusIcon, RedoIcon, SideChatIcon, TerminalIcon, AgentsIcon } from './icons'
import { MessageView, PermissionCard, QuestionCard } from './Messages'
import type { ActiveChat, PanelKind, Worktree } from './Shell'

interface Props {
  chatsDir: string
  projects: string[]
  worktrees: Record<string, Worktree[]>
  active: ActiveChat
  model: string
  /** Selected primary agent; undefined = opencode's default agent. Switched with /plan, /build, … */
  agent?: string
  /** A mention pushed from the Files panel ("Add to chat"). */
  insert?: Mention & { nonce: number }
  openPanel?: PanelKind
  onChangeAgent: (agent: string | undefined) => void
  onOpenSideChat?: (question?: string) => void
  onTogglePanel: (kind: PanelKind) => void
  onOpenSubagent: (sessionId: string) => void
  onOpenSettings: () => void
  onChangeDirectory: (dir: string) => void
  onAddProject: () => Promise<string | null>
  onCreateWorktree: (project: string) => Promise<string | null>
  onSessionCreated: (sessionId: string) => void
}

export function ChatView(props: Props): React.JSX.Element {
  const { chatsDir, active, model, agent } = props
  const { directory, sessionId } = active
  const { messages, permissions, questions, todos, revert, busy, error } = useSession(directory, sessionId)
  const [sendError, setSendError] = useState<string>()
  const [defaultAgent, setDefaultAgent] = useState('build')
  const bottom = useRef<HTMLDivElement>(null)
  const inventory = useInventory()
  const project = projectOf(directory, props.projects, props.worktrees)
  const worktree = project && project !== directory ? props.worktrees[project]?.find((w) => w.directory === directory) : undefined
  const isProject = directory !== chatsDir

  useEffect(() => {
    window.api.getSettings().then((s) => typeof s.opencode.default_agent === 'string' && setDefaultAgent(s.opencode.default_agent))
  }, [])
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages, permissions, questions])

  // Undo (opencode session.revert) hides messages from the reverted one on, until redo or a new message.
  const visible = revert ? messages.filter((m) => m.id < revert.messageID) : messages
  const hiddenCount = messages.length - visible.length

  /** New chats get their session on the first action; the parent re-keys this view to it. */
  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId
    const session = await window.api.createSession(directory)
    props.onSessionCreated(session.id)
    return session.id
  }

  async function run(action: () => Promise<unknown>): Promise<void> {
    setSendError(undefined)
    try {
      await action()
    } catch (err) {
      setSendError(String(err).replace(/^Error: (Error invoking remote method '[^']+': )?/, ''))
    }
  }

  const send = (req: SendRequest): Promise<void> =>
    run(async () => {
      if (!sessionId) {
        const id = await ensureSession()
        pendingPrompt.set(id, req)
        return
      }
      await window.api.prompt(directory, sessionId, req.text, req.agent, undefined, req.files)
    })

  const shell = (command: string, shellAgent: string): Promise<void> =>
    run(async () => {
      const id = await ensureSession()
      await window.api.oc('session.shell', { directory, sessionID: id, agent: shellAgent, command, model: { providerID: 'ollama', modelID: model } })
    })

  const compact = (): Promise<void> =>
    run(async () => {
      if (!sessionId) return
      await window.api.oc('session.summarize', { directory, sessionID: sessionId, providerID: 'ollama', modelID: model })
    })

  // Send the first message of a just-created session (after useSession has subscribed).
  useEffect(() => {
    if (!sessionId) return
    const pending = pendingPrompt.get(sessionId)
    if (!pending) return
    pendingPrompt.delete(sessionId)
    window.api.prompt(directory, sessionId, pending.text, pending.agent, undefined, pending.files).catch((err) => setSendError(String(err)))
  }, [directory, sessionId])

  const respond = (p: PermissionRequest, r: PermissionResponse): Promise<void> => window.api.respondPermission(directory, p.id, r)
  const empty = messages.length === 0 && !sessionId
  const panelButton = (kind: PanelKind, title: string, icon: React.ReactNode, label: string): React.JSX.Element => (
    <button
      onClick={() => (kind === 'side' && props.openPanel !== 'side' ? props.onOpenSideChat?.() : props.onTogglePanel(kind))}
      title={title}
      className={`no-drag flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white ${props.openPanel === kind ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white' : 'text-neutral-500'}`}
    >
      {icon}
      <span className="hidden whitespace-nowrap @3xl:inline">{label}</span>
    </button>
  )

  return (
    <main className="flex min-h-0 min-w-[360px] flex-1 flex-col bg-white dark:bg-neutral-950">
      <div className="drag @container flex h-12 shrink-0 items-center justify-end gap-1 px-4">
        {isProject && <GitChip directory={directory} onOpen={() => props.onTogglePanel('changes')} />}
        <span className="flex-1" />
        {sessionId && panelButton('side', 'Side chat: ask about this chat without adding to it (/side)', <SideChatIcon className="size-3.5" />, 'Side chat')}
        {sessionId && panelButton('agents', 'Subagents this chat started', <AgentsIcon className="size-3.5" />, 'Subagents')}
        {panelButton('changes', 'Changes: what the agent changed, with diffs', <DiffIcon className="size-3.5" />, 'Changes')}
        {panelButton('files', 'Browse and search files', <FilesIcon className="size-3.5" />, 'Files')}
        {panelButton('terminal', 'Terminal in this folder', <TerminalIcon className="size-3.5" />, 'Terminal')}
      </div>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16">
          <img src={logo} alt="" className="size-20" />
          <h1 className="text-center text-2xl font-medium">
            {isProject ? (
              <>
                What should we work on in <span className="underline decoration-dotted underline-offset-4">{basename(project ?? directory)}</span>
                {worktree && <span className="text-neutral-500"> ({worktree.branch ?? worktree.name})</span>}?
              </>
            ) : (
              'What should we work on?'
            )}
          </h1>
        </div>
      ) : (
        <div className="selectable min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-4 px-6 py-4">
            {visible.map((m) => (
              <MessageView
                key={m.id}
                message={m}
                onUndo={m.role === 'user' && !busy && sessionId ? () => run(() => window.api.oc('session.revert', { directory, sessionID: sessionId, messageID: m.id })) : undefined}
                onOpenSubagent={props.onOpenSubagent}
              />
            ))}
            {revert && sessionId && (
              <div className="flex items-center gap-3 rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
                <span className="flex-1 text-neutral-600 dark:text-neutral-300">
                  Undid {hiddenCount} message{hiddenCount === 1 ? '' : 's'} and their file changes. Sending a new message makes this permanent.
                </span>
                <button
                  onClick={() => run(() => window.api.oc('session.unrevert', { directory, sessionID: sessionId }))}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
                >
                  <RedoIcon className="size-3.5" /> Redo
                </button>
              </div>
            )}
            {permissions.map((p) => (
              <PermissionCard key={p.id} permission={p} onRespond={(r) => respond(p, r)} />
            ))}
            {questions.map((q) => (
              <QuestionCard key={q.id} request={q} onAnswer={(a) => window.api.replyQuestion(directory, q.id, a)} onDismiss={() => window.api.rejectQuestion(directory, q.id)} />
            ))}
            {busy && questions.length === 0 && <p className="animate-pulse text-sm text-neutral-500">Working…</p>}
            {(error || sendError) && <p className="text-sm text-red-500">{error ?? sendError}</p>}
            <div ref={bottom} />
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-6 pb-6">
        {todos.length > 0 && <TodoList todos={todos} />}
        <Composer
          directory={directory}
          sessionId={sessionId}
          model={model}
          agent={agent}
          defaultAgent={defaultAgent}
          inventory={inventory}
          messages={messages}
          busy={busy}
          insert={props.insert}
          placeholder={isProject ? `Ask anything about ${basename(project ?? directory)}… (/ commands, @ files, ! shell)` : 'Ask anything… (/ commands, @ files, ! shell)'}
          header={
            <FolderPicker
              chatsDir={chatsDir}
              projects={props.projects}
              worktrees={props.worktrees}
              directory={directory}
              locked={!!sessionId}
              onChange={props.onChangeDirectory}
              onAddProject={props.onAddProject}
              onCreateWorktree={props.onCreateWorktree}
            />
          }
          onChangeAgent={props.onChangeAgent}
          onOpenSettings={props.onOpenSettings}
          onOpenSideChat={props.onOpenSideChat}
          onSend={send}
          onShell={shell}
          onCompact={compact}
          onError={setSendError}
        />
      </div>
    </main>
  )
}

/** First prompts for sessions created by a ChatView that's about to be replaced (re-keyed). */
const pendingPrompt = new Map<string, SendRequest>()

/** The project a directory belongs to: itself, or the project whose worktree it is. */
export function projectOf(directory: string, projects: string[], worktrees: Record<string, Worktree[]>): string | undefined {
  if (projects.includes(directory)) return directory
  return Object.keys(worktrees).find((p) => worktrees[p].some((w) => w.directory === directory))
}

/** The agent's to-do list (opencode todowrite), shown above the composer while it has items. */
function TodoList({ todos }: { todos: Todo[] }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const done = todos.filter((t) => t.status === 'completed').length
  return (
    <div className="mb-2 rounded-xl border border-neutral-200 bg-neutral-50 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-500">
        <span className="font-medium text-neutral-700 dark:text-neutral-300">To-do</span>
        <span>
          {done}/{todos.length} done
        </span>
        <span className="flex-1" />
        <ChevronDownIcon className={`size-3 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <ul className="max-h-40 space-y-1 overflow-y-auto px-3 pb-2">
          {todos.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              {t.status === 'completed' ? (
                <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
              ) : t.status === 'in_progress' ? (
                <CircleIcon className="mt-0.5 size-3.5 shrink-0 animate-pulse text-blue-500" />
              ) : (
                <CircleIcon className="mt-0.5 size-3.5 shrink-0 text-neutral-400" />
              )}
              <span className={t.status === 'completed' || t.status === 'cancelled' ? 'text-neutral-500 line-through' : ''}>{t.content}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Branch + uncommitted-change count for project folders (opencode vcs.get / vcs.status). */
function GitChip({ directory, onOpen }: { directory: string; onOpen: () => void }): React.JSX.Element | null {
  const [info, setInfo] = useState<{ branch?: string; changes: number }>()
  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      Promise.all([window.api.oc<{ branch?: string }>('vcs.get', { directory }), window.api.oc<unknown[]>('vcs.status', { directory })])
        .then(([v, st]) => !cancelled && setInfo(v?.branch ? { branch: v.branch, changes: st?.length ?? 0 } : undefined))
        .catch(() => !cancelled && setInfo(undefined))
    }
    load()
    const off = window.api.onAgentEvent((d, e) => d === directory && (e.type === 'file.edited' || e.type === 'session.idle' || e.type === 'vcs.branch.updated') && load())
    return () => {
      cancelled = true
      off()
    }
  }, [directory])
  if (!info?.branch) return null
  return (
    <button onClick={onOpen} title="Git branch and uncommitted changes" className="no-drag flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
      <BranchIcon className="size-3.5" /> {info.branch}
      {info.changes > 0 && <span className="rounded bg-amber-500/15 px-1 text-amber-600 dark:text-amber-400">{info.changes}</span>}
    </button>
  )
}

function FolderPicker({
  chatsDir,
  projects,
  worktrees,
  directory,
  locked,
  onChange,
  onAddProject,
  onCreateWorktree
}: {
  chatsDir: string
  projects: string[]
  worktrees: Record<string, Worktree[]>
  directory: string
  locked: boolean
  onChange: (dir: string) => void
  onAddProject: () => Promise<string | null>
  onCreateWorktree: (project: string) => Promise<string | null>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const project = projectOf(directory, projects, worktrees)
  const wt = project && project !== directory ? worktrees[project]?.find((w) => w.directory === directory) : undefined
  const label = directory === chatsDir ? 'No folder' : wt ? `${basename(project!)} · ${wt.branch ?? wt.name}` : basename(directory)
  const chip = 'flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs whitespace-nowrap text-neutral-600 dark:text-neutral-300'
  const icon = wt ? <BranchIcon className="size-3.5" /> : <FolderIcon className="size-3.5" />

  // A chat's folder is fixed once it has started.
  if (locked) {
    return (
      <span className={chip} title={directory === chatsDir ? undefined : directory}>
        {icon} {label}
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
        {icon} {label} <ChevronDownIcon className="size-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-2 max-h-96 w-72 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <MenuItem selected={directory === chatsDir} onClick={() => pick(chatsDir)}>
              <span className="text-neutral-500">No folder</span>
            </MenuItem>
            {projects.map((dir) => (
              <div key={dir}>
                <MenuItem selected={directory === dir} onClick={() => pick(dir)} title={dir}>
                  <FolderIcon className="size-3.5 shrink-0" /> <span className="truncate">{basename(dir)}</span>
                </MenuItem>
                {(worktrees[dir] ?? []).map((w) => (
                  <MenuItem key={w.directory} selected={directory === w.directory} onClick={() => pick(w.directory)} title={w.directory}>
                    <span className="w-3.5" />
                    <BranchIcon className="size-3.5 shrink-0" /> <span className="truncate">{w.branch ?? w.name}</span>
                  </MenuItem>
                ))}
                <MenuItem
                  onClick={async () => {
                    setOpen(false)
                    const created = await onCreateWorktree(dir)
                    if (created) onChange(created)
                  }}
                  title="A separate git checkout on its own branch, so this chat can work in parallel"
                >
                  <span className="w-3.5" />
                  <PlusIcon className="size-3.5 shrink-0" /> <span className="text-neutral-500">New worktree</span>
                </MenuItem>
              </div>
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

function MenuItem({ selected, onClick, title, children }: { selected?: boolean; onClick: () => void; title?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <button onClick={onClick} title={title} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800">
      {children}
      <span className="flex-1" />
      {selected && <CheckIcon className="size-3.5 text-blue-500" />}
    </button>
  )
}
