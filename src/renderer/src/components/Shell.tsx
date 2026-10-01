import { useCallback, useEffect, useRef, useState } from 'react'
import type { RuntimeStatus, Session } from '@shared/types'
import { ChatView, projectOf } from './ChatView'
import { fileMention, type Mention } from './Composer'
import { XIcon } from './icons'
import { AgentsPanel } from './panels/AgentsPanel'
import { ChangesPanel } from './panels/ChangesPanel'
import { FilesPanel } from './panels/FilesPanel'
import { TerminalPanel } from './panels/TerminalPanel'
import { SettingsPage } from './settings/SettingsPage'
import { SideChat } from './SideChat'
import { Sidebar } from './Sidebar'
import { UpdateBanner } from './UpdateBanner'

export interface ActiveChat {
  directory: string
  /** Undefined for a new chat; the session is created when the first message is sent. */
  sessionId?: string
}

/** Right-hand panels (Codex-style). */
export type PanelKind = 'side' | 'agents' | 'changes' | 'files' | 'terminal'

/** A git worktree of a project (opencode worktree.*): a separate checkout on its own branch. */
export interface Worktree {
  name: string
  branch?: string
  directory: string
}

const PANEL_TITLES: Record<PanelKind, string> = { side: 'Side chat', agents: 'Subagents', changes: 'Changes', files: 'Files', terminal: 'Terminal' }
const SESSION_EVENTS = new Set(['session.created', 'session.updated', 'session.deleted'])
const errorText = (err: unknown): string => String(err).replace(/^Error: (Error invoking remote method '[^']+': )?(Error: )?/, '')

export function Shell({ status }: { status: RuntimeStatus }): React.JSX.Element {
  const [chatsDir, setChatsDir] = useState<string>()
  const [projects, setProjects] = useState<string[]>([])
  const [worktrees, setWorktrees] = useState<Record<string, Worktree[]>>({})
  const [sessions, setSessions] = useState<Record<string, Session[]>>({})
  const [active, setActive] = useState<ActiveChat>()
  const [view, setView] = useState<'chat' | 'settings'>('chat')
  const [agent, setAgent] = useState<string>()
  const [panel, setPanel] = useState<PanelKind>()
  const [subagent, setSubagent] = useState<string>()
  const [insert, setInsert] = useState<Mention & { nonce: number }>()
  const [notice, setNotice] = useState<string>()
  // Side chat (a hidden fork) for the active chat; discarded when closed or when leaving the chat.
  const [side, setSide] = useState<{ directory: string; sessionId: string; parentId: string; question?: string }>()

  /** Opens (or re-opens with fresh context) the side chat; `question` is asked right away. */
  async function openSideChat(question?: string): Promise<void> {
    if (!active?.sessionId) return
    setPanel('side')
    if (side?.parentId === active.sessionId && !question) return
    if (side) void window.api.deleteSession(side.directory, side.sessionId)
    const fork = await window.api.forkSideChat(active.directory, active.sessionId)
    setSide({ directory: active.directory, sessionId: fork.id, parentId: active.sessionId, question })
  }

  function closeSideChat(): void {
    if (side) void window.api.deleteSession(side.directory, side.sessionId)
    setSide(undefined)
  }

  function togglePanel(kind: PanelKind): void {
    if (panel === kind) {
      if (kind === 'side') closeSideChat()
      setPanel(undefined)
    } else setPanel(kind)
  }

  // Leaving a chat discards its side chat and closes chat-specific panels.
  useEffect(() => {
    if (side && active?.sessionId !== side.parentId) closeSideChat()
    if (!active?.sessionId && (panel === 'side' || panel === 'agents')) setPanel(undefined)
    setSubagent(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.sessionId])

  // Fails harmlessly while the agent engine restarts; the effect below reloads once it's back.
  const loadSessions = useCallback(async (dir: string) => {
    const list = await window.api.listSessions(dir).catch(() => undefined)
    if (list) setSessions((s) => ({ ...s, [dir]: list }))
  }, [])

  /** A project's worktrees (none if it isn't a git repo), plus their chats. */
  const loadWorktrees = useCallback(
    async (project: string) => {
      // worktree.list returns the worktree folders; each one's branch comes from vcs.get.
      const dirs = await window.api.oc<string[]>('worktree.list', { directory: project }).catch(() => [] as string[])
      const others: Worktree[] = await Promise.all(
        (dirs ?? [])
          .filter((d) => d !== project)
          .map(async (directory) => {
            const vcs = await window.api.oc<{ branch?: string }>('vcs.get', { directory }).catch(() => undefined)
            return { name: directory.split('/').pop() ?? directory, branch: vcs?.branch, directory }
          })
      )
      setWorktrees((w) => ({ ...w, [project]: others }))
      for (const w of others) void loadSessions(w.directory)
    },
    [loadSessions]
  )

  const engineReady = status.opencode === 'ready'
  useEffect(() => {
    if (!engineReady || !chatsDir) return
    for (const dir of [chatsDir, ...projects]) void loadSessions(dir)
    for (const p of projects) void loadWorktrees(p)
  }, [engineReady, chatsDir, projects, loadSessions, loadWorktrees])

  useEffect(() => {
    Promise.all([window.api.chatsDirectory(), window.api.listProjects()]).then(([chats, projs]) => {
      setChatsDir(chats)
      setProjects(projs)
      setActive({ directory: chats })
    })
  }, [])

  // Keep the sidebar in sync as sessions are created, retitled or deleted (debounced per folder).
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(
    () =>
      window.api.onAgentEvent((dir, event) => {
        if (!SESSION_EVENTS.has(event.type)) return
        clearTimeout(timers.current.get(dir))
        timers.current.set(
          dir,
          setTimeout(() => loadSessions(dir), 300)
        )
      }),
    [loadSessions]
  )

  async function addProject(): Promise<string | null> {
    const dir = await window.api.addProject()
    if (!dir) return null
    setProjects((p) => [dir, ...p.filter((d) => d !== dir)])
    return dir
  }

  async function removeProject(dir: string): Promise<void> {
    await window.api.removeProject(dir)
    setProjects((p) => p.filter((d) => d !== dir))
    if (active && projectOf(active.directory, [dir], worktrees) === dir) setActive({ directory: chatsDir! })
  }

  async function createWorktree(project: string): Promise<string | null> {
    setNotice(undefined)
    try {
      const w = await window.api.oc<Worktree>('worktree.create', { directory: project, worktreeCreateInput: {} })
      await loadWorktrees(project)
      return w.directory
    } catch (err) {
      setNotice(`Couldn’t create a worktree: ${errorText(err)}. Worktrees need the folder to be a git repository.`)
      return null
    }
  }

  async function removeWorktree(project: string, dir: string): Promise<void> {
    setNotice(undefined)
    try {
      await window.api.oc('worktree.remove', { directory: project, worktreeRemoveInput: { directory: dir } })
      if (active?.directory === dir) setActive({ directory: project })
      await loadWorktrees(project)
    } catch (err) {
      setNotice(`Couldn’t remove the worktree: ${errorText(err)}`)
    }
  }

  async function deleteChat(dir: string, id: string): Promise<void> {
    await window.api.deleteSession(dir, id)
    if (active?.sessionId === id) setActive({ directory: dir })
    void loadSessions(dir)
  }

  async function renameChat(dir: string, id: string, title: string): Promise<void> {
    await window.api.oc('session.update', { directory: dir, sessionID: id, title })
    void loadSessions(dir)
  }

  if (!chatsDir || !active) return <div className="flex-1" />
  const isGit = !!projectOf(active.directory, projects, worktrees) && worktrees[projectOf(active.directory, projects, worktrees)!] !== undefined

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar
        chatsDir={chatsDir}
        projects={projects}
        worktrees={worktrees}
        sessions={sessions}
        active={active}
        onSelect={(chat) => {
          setActive(chat)
          setView('chat')
        }}
        onOpenSettings={() => setView('settings')}
        settingsOpen={view === 'settings'}
        onAddProject={addProject}
        onRemoveProject={removeProject}
        onRemoveWorktree={removeWorktree}
        onDeleteChat={deleteChat}
        onRenameChat={renameChat}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <StatusBanner status={status} />
        <UpdateBanner />
        {notice && (
          <div className="flex items-center gap-2 bg-amber-500/15 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-300">
            <span className="flex-1">{notice}</span>
            <button onClick={() => setNotice(undefined)}>
              <XIcon className="size-3.5" />
            </button>
          </div>
        )}
        {view === 'settings' ? (
          <SettingsPage onBack={() => setView('chat')} />
        ) : (
          <ChatView
            key={active.sessionId ?? `new:${active.directory}`}
            chatsDir={chatsDir}
            projects={projects}
            worktrees={worktrees}
            active={active}
            model={status.model}
            agent={agent}
            insert={insert}
            openPanel={panel}
            onChangeAgent={setAgent}
            onOpenSideChat={openSideChat}
            onTogglePanel={togglePanel}
            onOpenSubagent={(id) => {
              setSubagent(id)
              setPanel('agents')
            }}
            onOpenSettings={() => setView('settings')}
            onChangeDirectory={(directory) => setActive({ directory })}
            onAddProject={addProject}
            onCreateWorktree={createWorktree}
            onSessionCreated={(sessionId) => {
              setActive({ directory: active.directory, sessionId })
              void loadSessions(active.directory)
            }}
          />
        )}
      </div>
      {panel && view === 'chat' && (
        <aside className="flex w-[clamp(300px,34vw,520px)] shrink-0 flex-col border-l border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="drag flex h-12 shrink-0 items-center gap-2 px-4">
            <span className="text-sm font-medium">{PANEL_TITLES[panel]}</span>
            <span className="flex-1" />
            <button onClick={() => togglePanel(panel)} title={panel === 'side' ? 'Close (discards the side chat)' : 'Close'} className="no-drag rounded p-1 text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
              <XIcon />
            </button>
          </div>
          {panel === 'side' && side && <SideChat key={side.sessionId} directory={side.directory} sessionId={side.sessionId} agent={agent} initialQuestion={side.question} />}
          {panel === 'side' && !side && <p className="px-4 text-xs text-neutral-500">Opening…</p>}
          {panel === 'agents' && active.sessionId && <AgentsPanel directory={active.directory} sessionId={active.sessionId} focus={subagent} />}
          {panel === 'changes' && <ChangesPanel key={active.sessionId ?? active.directory} directory={active.directory} sessionId={active.sessionId} isGit={isGit} />}
          {panel === 'files' && (
            <FilesPanel key={active.directory} directory={active.directory} onAddToChat={(path) => setInsert({ ...fileMention(active.directory, path), nonce: Date.now() })} />
          )}
          {panel === 'terminal' && <TerminalPanel key={active.directory} directory={active.directory} />}
        </aside>
      )}
    </div>
  )
}

/** Shown while services restart (e.g. after saving settings) or if one failed. */
function StatusBanner({ status }: { status: RuntimeStatus }): React.JSX.Element | null {
  const starting = status.ollama === 'starting' || status.opencode === 'starting'
  const failed = status.ollama === 'error' || status.opencode === 'error'
  if (!starting && !failed) return null
  return (
    <div className={`px-4 py-1.5 text-xs ${failed ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}>
      {failed ? `A service failed to start: ${status.error ?? 'unknown error'}. Check Settings.` : 'Restarting the agent engine…'}
    </div>
  )
}
