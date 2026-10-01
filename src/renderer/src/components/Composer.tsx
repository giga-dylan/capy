import { useEffect, useRef, useState } from 'react'
import type { FilePartInput, RuntimeInventory } from '@shared/types'
import { basename } from '../paths'
import type { ChatMessage } from '../useSession'
import { AccessPicker } from './AccessPicker'
import { EffortPicker } from './EffortPicker'
import { ArrowUpIcon, PaperclipIcon, StopIcon, XIcon } from './icons'
import { ModelPicker } from './ModelPicker'

/** A file or MCP resource the user referenced with @ (sent as an opencode file part). */
export interface Mention {
  label: string
  part: FilePartInput
}

/** An @mention of a file in the chat's folder: opencode reads it when the message is sent. */
export function fileMention(directory: string, path: string): Mention {
  const label = `@${path}`
  const absolute = path.startsWith('/') ? path : `${directory}/${path}`
  return {
    label,
    part: { type: 'file', mime: 'text/plain', filename: basename(path), url: `file://${absolute}`, source: { type: 'file', path: absolute, text: { value: label, start: 0, end: label.length } } }
  }
}

interface McpResource {
  name: string
  uri: string
  description?: string
  mimeType?: string
  client: string
}

export interface SendRequest {
  text: string
  files: FilePartInput[]
  agent?: string
}

interface Props {
  directory: string
  sessionId?: string
  model: string
  agent?: string
  defaultAgent: string
  inventory?: RuntimeInventory
  messages: ChatMessage[]
  busy: boolean
  placeholder: string
  /** A mention pushed from elsewhere (e.g. "Add to chat" in the Files panel). */
  insert?: Mention & { nonce: number }
  header: React.ReactNode
  onChangeAgent: (agent: string | undefined) => void
  onOpenSettings: () => void
  onOpenSideChat?: (question?: string) => void
  onSend: (req: SendRequest) => Promise<void>
  /** `!command`: run in the chat's shell (opencode session.shell). */
  onShell: (command: string, agent: string) => Promise<void>
  onCompact: () => Promise<void>
  onError: (message: string) => void
}

const FILE_LIMIT = 20 * 1024 * 1024

export function Composer(props: Props): React.JSX.Element {
  const { directory, sessionId, model, agent, defaultAgent, inventory, messages, busy, insert } = props
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [mentions, setMentions] = useState<Mention[]>([])
  const [attachments, setAttachments] = useState<FilePartInput[]>([])
  const [fileHits, setFileHits] = useState<string[]>([])
  const [resources, setResources] = useState<McpResource[]>([])
  const [contextLimit, setContextLimit] = useState(32768)
  const [dragging, setDragging] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.getSettings().then((s) => setContextLimit(s.contextLength))
    window.api
      .oc<Record<string, McpResource>>('experimental.resource.list', { directory })
      .then((r) => setResources(Object.values(r ?? {})))
      .catch(() => undefined)
  }, [directory])

  useEffect(() => {
    if (!insert) return
    addMention(insert)
    setInput((v) => `${v}${v && !v.endsWith(' ') ? ' ' : ''}${insert.label} `)
    textarea.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insert?.nonce])

  // ---- slash entries: /side, primary agents as modes, /compact, opencode commands
  const commandNames = new Set((inventory?.commands ?? []).map((c) => c.name))
  const modeAgents = (inventory?.agents ?? []).filter((a) => a.mode !== 'subagent' && !a.hidden && !commandNames.has(a.name))
  const builtIns = [
    { name: 'side', description: 'Open a side chat (add a question to ask it right away)' },
    { name: 'compact', description: 'Summarize this chat to free up context' }
  ].filter((b) => !commandNames.has(b.name))
  const slashEntries = [
    ...builtIns,
    ...modeAgents.map((a) => ({ name: a.name, description: `Switch to ${a.name} mode${a.description ? ` · ${a.description}` : ''}` })),
    ...(inventory?.commands ?? []).map((c) => ({ name: c.name, description: c.description }))
  ]
  const slash = /^\/(\S*)$/.exec(input)
  const slashHits = slash ? slashEntries.filter((c) => c.name.startsWith(slash[1])).slice(0, 8) : []

  // ---- @mentions: the word at the end of the input
  const at = /(?:^|\s)@([^\s@]*)$/.exec(input)
  const atQuery = at?.[1]
  useEffect(() => {
    if (atQuery === undefined) return setFileHits([])
    const t = setTimeout(() => {
      window.api
        .oc<string[]>('find.files', { directory, query: atQuery, limit: 8 })
        .then((hits) => setFileHits(hits ?? []))
        .catch(() => setFileHits([]))
    }, 120)
    return () => clearTimeout(t)
  }, [atQuery, directory])
  const resourceHits = atQuery === undefined ? [] : resources.filter((r) => `${r.client}:${r.name}`.toLowerCase().includes(atQuery.toLowerCase())).slice(0, 4)

  function addMention(m: Mention): void {
    setMentions((list) => (list.some((x) => x.label === m.label) ? list : [...list, m]))
  }

  function pickFile(path: string): void {
    const mention = fileMention(directory, path)
    addMention(mention)
    setInput((v) => v.replace(/@[^\s@]*$/, `${mention.label} `))
    textarea.current?.focus()
  }

  function pickResource(r: McpResource): void {
    const label = `@${r.client}:${r.name}`
    addMention({
      label,
      part: { type: 'file', mime: r.mimeType ?? 'text/plain', filename: r.name, url: r.uri, source: { type: 'resource', clientName: r.client, uri: r.uri, text: { value: label, start: 0, end: label.length } } }
    })
    setInput((v) => v.replace(/@[^\s@]*$/, `${label} `))
    textarea.current?.focus()
  }

  // ---- attachments (images for vision models, or any file)
  async function attach(files: FileList | File[]): Promise<void> {
    for (const file of Array.from(files)) {
      if (file.size > FILE_LIMIT) {
        props.onError(`${file.name} is larger than 20 MB.`)
        continue
      }
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      setAttachments((a) => [...a, { type: 'file', mime: file.type || 'application/octet-stream', filename: file.name || 'pasted image', url }])
    }
  }

  // ---- context meter: the last assistant turn's prompt size vs the context window
  const last = [...messages].reverse().find((m) => m.tokens && m.tokens.input + m.tokens.cache.read > 0)
  const used = last?.tokens ? last.tokens.input + last.tokens.cache.read + last.tokens.cache.write + last.tokens.output : 0
  const ratio = Math.min(1, used / contextLimit)

  async function send(): Promise<void> {
    let text = input.trim()
    if ((!text && !attachments.length) || busy || sending) return
    const reset = (): void => {
      setInput('')
      setMentions([])
      setAttachments([])
    }

    const side = commandNames.has('side') ? null : /^\/side(?:\s+([\s\S]*))?$/.exec(text)
    if (side) {
      if (!sessionId) return props.onError('Start the chat first; a side chat asks about an existing conversation.')
      reset()
      props.onOpenSideChat?.(side[1]?.trim() || undefined)
      return
    }
    if (!commandNames.has('compact') && text === '/compact') {
      if (!sessionId) return props.onError('Nothing to compact yet.')
      reset()
      return props.onCompact()
    }
    if (text.startsWith('!') && text.length > 1) {
      setSending(true)
      reset()
      try {
        await props.onShell(text.slice(1).trim(), agent ?? defaultAgent)
      } finally {
        setSending(false)
      }
      return
    }

    let sendAgent = agent
    const mode = /^\/(\S+)\s*([\s\S]*)$/.exec(text)
    const modeAgent = mode && modeAgents.find((a) => a.name === mode[1])
    if (mode && modeAgent) {
      sendAgent = modeAgent.name === defaultAgent ? undefined : modeAgent.name
      props.onChangeAgent(sendAgent)
      text = mode[2].trim()
      if (!text && !attachments.length) return reset()
    }

    // Only mentions still present in the text are sent.
    const files = [...mentions.filter((m) => text.includes(m.label)).map((m) => m.part), ...attachments]
    setSending(true)
    reset()
    try {
      await props.onSend({ text, files, agent: sendAgent })
    } finally {
      setSending(false)
    }
  }

  const suggestionRow = 'flex w-full items-baseline gap-3 px-4 py-1 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800'

  return (
    <div
      className={`rounded-2xl border bg-neutral-50 shadow-sm dark:bg-neutral-900 ${dragging ? 'border-blue-500' : 'border-neutral-200 dark:border-neutral-800'}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files.length) void attach(e.dataTransfer.files)
      }}
    >
      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">{props.header}</div>

      {(slashHits.length > 0 || fileHits.length > 0 || resourceHits.length > 0) && (
        <ul className="max-h-64 overflow-y-auto border-b border-neutral-200 py-1 dark:border-neutral-800">
          {slashHits.map((c, i) => (
            <li key={c.name}>
              <button onClick={() => setInput(`/${c.name} `)} className={`${suggestionRow} ${i === 0 ? 'bg-neutral-100/70 dark:bg-neutral-800/60' : ''}`}>
                <span className="font-mono text-xs">/{c.name}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{c.description}</span>
              </button>
            </li>
          ))}
          {fileHits.map((f, i) => (
            <li key={f}>
              <button onClick={() => pickFile(f)} className={`${suggestionRow} ${i === 0 ? 'bg-neutral-100/70 dark:bg-neutral-800/60' : ''}`}>
                <span className="truncate font-mono text-xs">@{f}</span>
              </button>
            </li>
          ))}
          {resourceHits.map((r) => (
            <li key={r.uri}>
              <button onClick={() => pickResource(r)} className={suggestionRow}>
                <span className="font-mono text-xs">
                  @{r.client}:{r.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">MCP resource{r.description ? ` · ${r.description}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {attachments.map((a, i) => (
            <span key={i} className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white py-1 pr-1 pl-1 text-xs dark:border-neutral-700 dark:bg-neutral-950">
              {a.mime.startsWith('image/') ? <img src={a.url} alt="" className="size-8 rounded object-cover" /> : <PaperclipIcon className="size-3.5" />}
              <span className="max-w-40 truncate">{a.filename}</span>
              <button onClick={() => setAttachments((list) => list.filter((_, j) => j !== i))} className="rounded p-0.5 text-neutral-500 hover:text-red-500">
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        ref={textarea}
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onPaste={(e) => {
          const files = [...e.clipboardData.files]
          if (files.length) {
            e.preventDefault()
            void attach(files)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Tab' && (slashHits.length || fileHits.length)) {
            e.preventDefault()
            if (slashHits.length) setInput(`/${slashHits[0].name} `)
            else pickFile(fileHits[0])
            return
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void send()
          }
        }}
        rows={2}
        placeholder={props.placeholder}
        className="block max-h-60 w-full resize-none bg-transparent px-4 pt-3 text-sm outline-none [field-sizing:content] placeholder:text-neutral-400"
      />

      {/* @container: labels appear in stages as the composer widens (@xl, @2xl, @3xl); below that, icons only.
          Only the model picker shrinks (its name truncates), so the row never overflows. */}
      <div className="@container flex min-w-0 items-center gap-1 px-3 pb-3 [&>*]:shrink-0 [&>.shrink]:shrink">
        <AccessPicker />
        <button onClick={() => fileInput.current?.click()} title="Attach files or images (or paste / drop them)" className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white">
          <PaperclipIcon className="size-3.5" />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void attach(e.target.files)
            e.target.value = ''
          }}
        />
        {agent && agent !== defaultAgent && (
          <span className="flex items-center gap-1 rounded-md bg-violet-500/15 px-2 py-1 text-xs whitespace-nowrap text-violet-600 capitalize dark:text-violet-300">
            {agent}
            <span className="hidden @xl:inline">mode</span>
            <button onClick={() => props.onChangeAgent(undefined)} title={`Back to ${defaultAgent} (/${defaultAgent})`} className="opacity-70 hover:opacity-100">
              <XIcon className="size-3" />
            </button>
          </span>
        )}
        <span className="flex-1" />
        {used > 0 && <ContextMeter used={used} limit={contextLimit} ratio={ratio} onCompact={props.onCompact} />}
        <ModelPicker model={model} onOpenSettings={props.onOpenSettings} />
        <EffortPicker model={model} />
        {busy ? (
          <button
            onClick={() => sessionId && window.api.abort(directory, sessionId)}
            title="Stop"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            <StopIcon className="size-3.5" />
          </button>
        ) : (
          <button
            onClick={() => void send()}
            disabled={(!input.trim() && !attachments.length) || sending}
            title="Send (Enter)"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30"
          >
            <ArrowUpIcon />
          </button>
        )}
      </div>
    </div>
  )
}

/** How full the context window is; click to compact (opencode session.summarize). */
function ContextMeter({ used, limit, ratio, onCompact }: { used: number; limit: number; ratio: number; onCompact: () => Promise<void> }): React.JSX.Element {
  const k = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n))
  const color = ratio > 0.85 ? 'text-red-500' : ratio > 0.6 ? 'text-amber-500' : 'text-neutral-500'
  const r = 6
  const c = 2 * Math.PI * r
  return (
    <button
      onClick={() => void onCompact()}
      title={`Context: ${k(used)} of ${k(limit)} tokens (${Math.round(ratio * 100)}%). Click to compact the chat (/compact).`}
      className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-neutral-200 dark:hover:bg-neutral-800 ${color}`}
    >
      <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90">
        <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} strokeLinecap="round" />
      </svg>
      <span className="hidden whitespace-nowrap @3xl:inline">{Math.round(ratio * 100)}%</span>
    </button>
  )
}
