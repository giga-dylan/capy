import { useCallback, useEffect, useRef, useState } from 'react'
import type { RuntimeStatus, Session } from '@shared/types'
import { ChatView } from './ChatView'
import { SettingsPage } from './settings/SettingsPage'
import { Sidebar } from './Sidebar'

export interface ActiveChat {
  directory: string
  /** Undefined for a new chat; the session is created when the first message is sent. */
  sessionId?: string
}

const SESSION_EVENTS = new Set(['session.created', 'session.updated', 'session.deleted'])

export function Shell({ status }: { status: RuntimeStatus }): React.JSX.Element {
  const [chatsDir, setChatsDir] = useState<string>()
  const [projects, setProjects] = useState<string[]>([])
  const [sessions, setSessions] = useState<Record<string, Session[]>>({})
  const [active, setActive] = useState<ActiveChat>()
  const [view, setView] = useState<'chat' | 'settings'>('chat')
  const [agent, setAgent] = useState<string>()

  // Fails harmlessly while the agent engine restarts; the effect below reloads once it's back.
  const loadSessions = useCallback(async (dir: string) => {
    const list = await window.api.listSessions(dir).catch(() => undefined)
    if (list) setSessions((s) => ({ ...s, [dir]: list }))
  }, [])

  const engineReady = status.opencode === 'ready'
  useEffect(() => {
    if (engineReady && chatsDir) for (const dir of [chatsDir, ...projects]) loadSessions(dir)
  }, [engineReady, chatsDir, projects, loadSessions])

  useEffect(() => {
    Promise.all([window.api.chatsDirectory(), window.api.listProjects()]).then(([chats, projs]) => {
      setChatsDir(chats)
      setProjects(projs)
      setActive({ directory: chats })
      for (const dir of [chats, ...projs]) loadSessions(dir)
    })
  }, [loadSessions])

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
    loadSessions(dir)
    return dir
  }

  async function removeProject(dir: string): Promise<void> {
    await window.api.removeProject(dir)
    setProjects((p) => p.filter((d) => d !== dir))
    if (active?.directory === dir) setActive({ directory: chatsDir! })
  }

  async function deleteChat(dir: string, id: string): Promise<void> {
    await window.api.deleteSession(dir, id)
    if (active?.sessionId === id) setActive({ directory: dir })
    loadSessions(dir)
  }

  if (!chatsDir || !active) return <div className="flex-1" />

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar
        chatsDir={chatsDir}
        projects={projects}
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
        onDeleteChat={deleteChat}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <StatusBanner status={status} />
        {view === 'settings' ? (
          <SettingsPage onBack={() => setView('chat')} />
        ) : (
          <ChatView
            key={active.sessionId ?? `new:${active.directory}`}
            chatsDir={chatsDir}
            projects={projects}
            active={active}
            model={status.model}
            agent={agent}
            onChangeAgent={setAgent}
            onOpenSettings={() => setView('settings')}
            onChangeDirectory={(directory) => setActive({ directory })}
            onAddProject={addProject}
            onSessionCreated={(sessionId) => {
              setActive({ directory: active.directory, sessionId })
              loadSessions(active.directory)
            }}
          />
        )}
      </div>
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
