import type { Part, PermissionRequest, ToolPart } from '@opencode-ai/sdk/v2'
import type { PermissionResponse } from '@shared/types'
import type { ChatMessage } from '../useSession'

export function MessageView({ message }: { message: ChatMessage }): React.JSX.Element {
  const isUser = message.role === 'user'
  return (
    <div className={isUser ? 'ml-auto max-w-[80%] rounded-lg bg-blue-600/10 px-3 py-2' : 'space-y-2'}>
      {message.parts.map((p) => (
        <PartView key={p.id} part={p} />
      ))}
      {message.error && <p className="text-sm text-red-500">{message.error}</p>}
    </div>
  )
}

function PartView({ part }: { part: Part }): React.JSX.Element | null {
  switch (part.type) {
    case 'text':
      return part.synthetic ? null : <p className="text-sm whitespace-pre-wrap">{part.text}</p>
    case 'reasoning':
      return (
        <details className="text-xs text-neutral-500">
          <summary className="cursor-pointer">Thinking</summary>
          <p className="mt-1 whitespace-pre-wrap">{part.text}</p>
        </details>
      )
    case 'tool':
      return <ToolView part={part} />
    default:
      return null
  }
}

function ToolView({ part }: { part: ToolPart }): React.JSX.Element {
  const { state } = part
  const title = ('title' in state && state.title) || part.tool
  const badge = {
    pending: 'text-neutral-400',
    running: 'text-amber-500',
    completed: 'text-emerald-500',
    error: 'text-red-500'
  }[state.status]
  return (
    <details className="rounded-md border border-neutral-200 text-xs dark:border-neutral-800">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5">
        <span className={badge}>●</span>
        <span className="font-mono">{part.tool}</span>
        <span className="truncate text-neutral-500">{title}</span>
      </summary>
      <pre className="max-h-64 overflow-auto border-t border-neutral-200 p-3 font-mono whitespace-pre-wrap dark:border-neutral-800">
        {state.status === 'completed' ? state.output : state.status === 'error' ? state.error : JSON.stringify(state.input, null, 2)}
      </pre>
    </details>
  )
}

const PERMISSION_LABELS: Record<string, string> = {
  edit: 'edit a file',
  bash: 'run a shell command',
  webfetch: 'fetch a web page',
  external_directory: 'access files outside this project'
}

export function PermissionCard({
  permission,
  onRespond
}: {
  permission: PermissionRequest
  onRespond: (r: PermissionResponse) => void
}): React.JSX.Element {
  const btn = 'rounded-md px-3 py-1 text-xs font-medium'
  const label = PERMISSION_LABELS[permission.permission] ?? permission.permission
  const target = (permission.metadata.filepath as string | undefined) ?? permission.patterns.join(', ')
  return (
    <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
      <p className="font-medium">Allow the agent to {label}?</p>
      {target && <p className="font-mono text-xs break-all text-neutral-600 dark:text-neutral-400">{target}</p>}
      <div className="flex gap-2">
        <button onClick={() => onRespond('once')} className={`${btn} bg-blue-600 text-white`}>
          Allow once
        </button>
        <button onClick={() => onRespond('always')} className={`${btn} bg-neutral-200 dark:bg-neutral-800`}>
          Always allow
        </button>
        <button onClick={() => onRespond('reject')} className={`${btn} text-red-500`}>
          Deny
        </button>
      </div>
    </div>
  )
}
