import { useState } from 'react'
import type { Part, PermissionRequest, QuestionRequest, ToolPart } from '@opencode-ai/sdk/v2'
import type { PermissionResponse } from '@shared/types'
import type { ChatMessage } from '../useSession'
import { PaperclipIcon, UndoIcon } from './icons'
import { Markdown } from './Markdown'

interface MessageActions {
  /** Undo this message and everything after it, including file changes (opencode session.revert). */
  onUndo?: () => void
  /** Open a subagent's session (from a task tool call). */
  onOpenSubagent?: (sessionId: string) => void
}

export function MessageView({ message, onUndo, onOpenSubagent }: { message: ChatMessage } & MessageActions): React.JSX.Element {
  const isUser = message.role === 'user'
  if (isUser) {
    return (
      <div className="group ml-auto flex max-w-[80%] items-start justify-end gap-1">
        {onUndo && (
          <button
            onClick={onUndo}
            title="Undo from here: remove this message and everything after it, and roll back the agent's file changes"
            className="mt-1.5 hidden rounded p-1 text-neutral-400 group-hover:block hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <UndoIcon className="size-3.5" />
          </button>
        )}
        <div className="min-w-0">
          <div className="space-y-2 rounded-lg bg-blue-600/10 px-3 py-2">
            {message.parts.map((p) => (
              <PartView key={p.id} part={p} />
            ))}
          </div>
          {message.time && <p className="mt-0.5 text-right text-[11px] text-neutral-400">{formatTime(message.time.created)}</p>}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {message.parts.map((p) => (
        <PartView key={p.id} part={p} markdown onOpenSubagent={onOpenSubagent} />
      ))}
      {message.error && <p className="text-sm text-red-500">{message.error}</p>}
      {message.time?.completed && (
        <p className="text-[11px] text-neutral-400" title={new Date(message.time.created).toLocaleString()}>
          {formatTime(message.time.completed)} · {formatDuration(message.time.completed - message.time.created)}
        </p>
      )}
    </div>
  )
}

/** "3:41 PM" today, "Sep 30, 3:41 PM" otherwise. */
function formatTime(ms: number): string {
  const d = new Date(ms)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function PartView({ part, markdown, onOpenSubagent }: { part: Part; markdown?: boolean; onOpenSubagent?: (sessionId: string) => void }): React.JSX.Element | null {
  switch (part.type) {
    case 'text':
      if (part.synthetic) return null
      // Agent output is Markdown; what the user typed is shown as written.
      return markdown ? <Markdown text={part.text} /> : <p className="text-sm whitespace-pre-wrap">{part.text}</p>
    case 'reasoning':
      return (
        <details className="text-xs text-neutral-500">
          <summary className="cursor-pointer">Thinking</summary>
          <div className="mt-1 opacity-90">
            <Markdown text={part.text} />
          </div>
        </details>
      )
    case 'tool':
      return <ToolView part={part} onOpenSubagent={onOpenSubagent} />
    case 'file':
      // Attachments and @mentions the user sent.
      return part.mime.startsWith('image/') && part.url.startsWith('data:') ? (
        <img src={part.url} alt={part.filename ?? ''} className="max-h-48 rounded-md" />
      ) : (
        <span className="inline-flex items-center gap-1 rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">
          <PaperclipIcon className="size-3" /> {part.filename ?? part.url}
        </span>
      )
    case 'compaction':
      return <p className="text-xs text-neutral-500 italic">Earlier messages were summarized to free up context.</p>
    default:
      return null
  }
}

function ToolView({ part, onOpenSubagent }: { part: ToolPart; onOpenSubagent?: (sessionId: string) => void }): React.JSX.Element {
  const { state } = part
  const title = ('title' in state && state.title) || part.tool
  const badge = {
    pending: 'text-neutral-400',
    running: 'text-amber-500',
    completed: 'text-emerald-500',
    error: 'text-red-500'
  }[state.status]
  // The task tool runs a subagent in a child session; opencode puts its id in the metadata.
  const metadata = ('metadata' in state ? state.metadata : undefined) as Record<string, unknown> | undefined
  const childId = part.tool === 'task' && typeof metadata?.sessionId === 'string' ? metadata.sessionId : undefined
  return (
    <details className="rounded-md border border-neutral-200 text-xs dark:border-neutral-800">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5">
        <span className={badge}>●</span>
        <span className="font-mono">{part.tool}</span>
        <span className="min-w-0 flex-1 truncate text-neutral-500">{title}</span>
        {childId && onOpenSubagent && (
          <button
            onClick={(e) => {
              e.preventDefault()
              onOpenSubagent(childId)
            }}
            className="shrink-0 rounded px-1.5 py-0.5 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
          >
            Open subagent
          </button>
        )}
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

/** The agent's question tool: pick option(s) or type an answer for each question, then submit. */
export function QuestionCard({ request, onAnswer, onDismiss }: { request: QuestionRequest; onAnswer: (answers: string[][]) => void; onDismiss: () => void }): React.JSX.Element {
  const [picked, setPicked] = useState<string[][]>(() => request.questions.map(() => []))
  const [typed, setTyped] = useState<string[]>(() => request.questions.map(() => ''))
  const answers = request.questions.map((_, i) => (typed[i].trim() ? [...picked[i], typed[i].trim()] : picked[i]))
  const complete = answers.every((a) => a.length > 0)

  const toggle = (qi: number, label: string, multiple?: boolean): void =>
    setPicked((p) => p.map((sel, i) => (i !== qi ? sel : multiple ? (sel.includes(label) ? sel.filter((l) => l !== label) : [...sel, label]) : [label])))

  return (
    <div className="space-y-4 rounded-md border border-blue-500/50 bg-blue-500/10 p-3 text-sm">
      {request.questions.map((q, qi) => (
        <div key={qi} className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-blue-600 uppercase dark:text-blue-300">{q.header}</p>
          <p className="font-medium">{q.question}</p>
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => {
              const on = picked[qi].includes(o.label)
              return (
                <button
                  key={o.label}
                  title={o.description}
                  onClick={() => toggle(qi, o.label, q.multiple)}
                  className={`rounded-md border px-3 py-1.5 text-left text-xs ${on ? 'border-blue-500 bg-blue-600 text-white' : 'border-neutral-300 hover:bg-white/50 dark:border-neutral-700 dark:hover:bg-neutral-800'}`}
                >
                  <span className="block font-medium">{o.label}</span>
                  {o.description && <span className={`block ${on ? 'text-blue-100' : 'text-neutral-500'}`}>{o.description}</span>}
                </button>
              )
            })}
          </div>
          {q.custom !== false && (
            <input
              value={typed[qi]}
              onChange={(e) => setTyped((t) => t.map((v, i) => (i === qi ? e.target.value : v)))}
              placeholder="Or type your own answer…"
              className="w-full rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-neutral-700"
            />
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <button disabled={!complete} onClick={() => onAnswer(answers)} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40">
          Answer
        </button>
        <button onClick={onDismiss} className="rounded-md px-3 py-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
          Dismiss
        </button>
      </div>
    </div>
  )
}
