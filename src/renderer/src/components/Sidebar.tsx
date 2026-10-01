import { useState } from 'react'
import type { Session } from '@shared/types'
import logo from '../assets/capy.svg'
import { basename } from '../paths'
import { FolderIcon, NewChatIcon, PlusIcon, SettingsIcon, TrashIcon, XIcon } from './icons'
import type { ActiveChat } from './Shell'

interface Props {
  chatsDir: string
  projects: string[]
  sessions: Record<string, Session[]>
  active: ActiveChat
  onSelect: (chat: ActiveChat) => void
  onAddProject: () => Promise<string | null>
  onRemoveProject: (dir: string) => void
  onDeleteChat: (dir: string, id: string) => void
  onOpenSettings: () => void
  settingsOpen: boolean
}

const COLLAPSED_COUNT = 5

export function Sidebar(props: Props): React.JSX.Element {
  const { chatsDir, projects, sessions, active, onSelect } = props

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="drag h-12 shrink-0" />
      <div className="flex items-center gap-2 px-4 pt-1 pb-3">
        <img src={logo} alt="" className="size-7" />
        <span className="text-base font-semibold">Capy</span>
      </div>
      <div className="px-2 pb-2">
        <button
          onClick={() => onSelect({ directory: chatsDir })}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-200/70 dark:hover:bg-neutral-800"
        >
          <NewChatIcon /> New chat
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        <section>
          <div className="group flex items-center justify-between px-2 pb-1">
            <h2 className="text-xs font-medium text-neutral-500">Projects</h2>
            <button
              onClick={async () => {
                const dir = await props.onAddProject()
                if (dir) onSelect({ directory: dir })
              }}
              title="Add project folder"
              className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
            >
              <PlusIcon />
            </button>
          </div>
          {projects.length === 0 && <p className="px-2 py-1 text-xs text-neutral-500">No projects yet</p>}
          {projects.map((dir) => (
            <ProjectGroup key={dir} dir={dir} {...props} />
          ))}
        </section>

        <section>
          <h2 className="px-2 pb-1 text-xs font-medium text-neutral-500">Chats</h2>
          <SessionList dir={chatsDir} list={sessions[chatsDir] ?? []} active={active} onSelect={onSelect} onDelete={props.onDeleteChat} />
        </section>
      </div>
      <div className="border-t border-neutral-200 p-2 dark:border-neutral-800">
        <button
          onClick={props.onOpenSettings}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${props.settingsOpen ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-200/70 dark:hover:bg-neutral-800'}`}
        >
          <SettingsIcon /> Settings
        </button>
      </div>
    </aside>
  )
}

function ProjectGroup({ dir, sessions, active, onSelect, onRemoveProject, onDeleteChat }: Props & { dir: string }): React.JSX.Element {
  const selected = active.directory === dir && !active.sessionId
  return (
    <div className="mb-1">
      <div
        className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${selected ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'}`}
      >
        <button onClick={() => onSelect({ directory: dir })} title={dir} className="flex min-w-0 flex-1 items-center gap-2 text-left text-neutral-600 dark:text-neutral-400">
          <FolderIcon /> <span className="truncate">{basename(dir)}</span>
        </button>
        <button
          onClick={() => onRemoveProject(dir)}
          title="Remove from list (doesn't delete files)"
          className="hidden rounded p-0.5 text-neutral-500 group-hover:block hover:text-neutral-900 dark:hover:text-white"
        >
          <XIcon />
        </button>
      </div>
      <div className="pl-5">
        <SessionList dir={dir} list={sessions[dir] ?? []} active={active} onSelect={onSelect} onDelete={onDeleteChat} />
      </div>
    </div>
  )
}

function SessionList({
  dir,
  list,
  active,
  onSelect,
  onDelete
}: {
  dir: string
  list: Session[]
  active: ActiveChat
  onSelect: (chat: ActiveChat) => void
  onDelete: (dir: string, id: string) => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? list : list.slice(0, COLLAPSED_COUNT)
  return (
    <ul>
      {shown.map((s) => (
        <li key={s.id}>
          <div
            className={`group flex items-center rounded-md px-2 py-1.5 text-sm ${active.sessionId === s.id ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-200/70 dark:hover:bg-neutral-800/70'}`}
          >
            <button onClick={() => onSelect({ directory: dir, sessionId: s.id })} className="min-w-0 flex-1 truncate text-left">
              {s.title || 'Untitled'}
            </button>
            <button
              onClick={() => onDelete(dir, s.id)}
              title="Delete chat"
              className="hidden rounded p-0.5 text-neutral-500 group-hover:block hover:text-red-500"
            >
              <TrashIcon />
            </button>
          </div>
        </li>
      ))}
      {list.length > COLLAPSED_COUNT && (
        <li>
          <button onClick={() => setExpanded(!expanded)} className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
            {expanded ? 'Show less' : `Show ${list.length - COLLAPSED_COUNT} more`}
          </button>
        </li>
      )}
    </ul>
  )
}
