import { useEffect, useRef, useState } from 'react'
import { useSession } from '../useSession'
import { ArrowUpIcon, StopIcon } from './icons'
import { MessageView, PermissionCard, QuestionCard } from './Messages'

/**
 * Tells the model it's in a side thread. Without it, the forked history just looks like its own
 * conversation, and "the main conversation" means nothing to it.
 */
const SIDE_CHAT_SYSTEM =
  'This is a side chat. Everything before the first message of this side chat is the main conversation, ' +
  'which the user is still having separately; you are seeing a copy of it as of when the side chat opened. ' +
  'Answer the user’s side questions using that conversation as context. When they say “the main conversation” ' +
  '(or “the chat”), they mean those earlier messages. Nothing said here is added to the main conversation.'

/** Side chats whose "/side <question>" has already been sent. */
const askedInitial = new Set<string>()

/**
 * Side chat: a fork of the current chat (opencode `session.fork`), so it has the full context but
 * nothing here is added to the main thread. Uses the main chat's agent and the app's access mode.
 */
export function SideChat({
  directory,
  sessionId,
  agent,
  initialQuestion
}: {
  directory: string
  sessionId: string
  /** The main chat's agent (mode), so the side chat has the same permissions. */
  agent?: string
  /** Sent as soon as the panel opens (from "/side <question>"). */
  initialQuestion?: string
}): React.JSX.Element {
  const { messages, permissions, questions, busy, error } = useSession(directory, sessionId)
  const [input, setInput] = useState('')
  // Messages copied from the main chat when forking; only what's asked here is shown.
  const [inherited, setInherited] = useState<Set<string>>()
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getMessages(directory, sessionId).then((m) => {
      setInherited(new Set(m.map((x) => x.info.id)))
      // Guarded: effects can run twice (React dev mode), and the question must be sent once.
      if (initialQuestion && !askedInitial.has(sessionId)) {
        askedInitial.add(sessionId)
        void window.api.prompt(directory, sessionId, initialQuestion, agent, SIDE_CHAT_SYSTEM)
      }
    })
    // Runs once per side chat (it's keyed by session id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory, sessionId])
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages, permissions, questions])

  const shown = inherited ? messages.filter((m) => !inherited.has(m.id)) : []

  async function send(): Promise<void> {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    await window.api.prompt(directory, sessionId, text, agent, SIDE_CHAT_SYSTEM)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="selectable min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-2">
        {shown.length === 0 && (
          <p className="text-xs text-neutral-500">
            Ask anything about this chat. The side chat sees the conversation so far, but nothing you ask here is added to it. It uses the same mode and
            access as the main chat.
          </p>
        )}
        {shown.map((m) => (
          <MessageView key={m.id} message={m} />
        ))}
        {permissions.map((p) => (
          <PermissionCard key={p.id} permission={p} onRespond={(r) => window.api.respondPermission(directory, p.id, r)} />
        ))}
        {questions.map((q) => (
          <QuestionCard key={q.id} request={q} onAnswer={(a) => window.api.replyQuestion(directory, q.id, a)} onDismiss={() => window.api.rejectQuestion(directory, q.id)} />
        ))}
        {busy && questions.length === 0 && <p className="animate-pulse text-sm text-neutral-500">Thinking…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div ref={bottom} />
      </div>
      <div className="p-3">
        <div className="flex items-end gap-2 rounded-xl border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-950">
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
            placeholder="Ask a side question…"
            className="block max-h-40 flex-1 resize-none bg-transparent px-1 text-sm outline-none [field-sizing:content] placeholder:text-neutral-400"
          />
          {busy ? (
            <button onClick={() => window.api.abort(directory, sessionId)} title="Stop" className="grid size-7 place-items-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              <StopIcon className="size-3" />
            </button>
          ) : (
            <button onClick={send} disabled={!input.trim()} title="Send" className="grid size-7 place-items-center rounded-full bg-blue-600 text-white disabled:opacity-30">
              <ArrowUpIcon className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
