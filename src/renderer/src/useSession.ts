import { useEffect, useState } from 'react'
import type { Message, Part, PermissionRequest, QuestionRequest, Session, Todo } from '@opencode-ai/sdk/v2'

export interface ChatMessage {
  id: string
  role: Message['role']
  parts: Part[]
  error?: string
  /** When it was sent (and, for replies, finished), from opencode's message info. */
  time?: { created: number; completed?: number }
  /** Assistant token usage, for the context meter. */
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
}

interface SessionState {
  messages: ChatMessage[]
  permissions: PermissionRequest[]
  /** Pending questions from the agent's question tool; the task waits until they're answered. */
  questions: QuestionRequest[]
  /** The agent's to-do list (todowrite tool). */
  todos: Todo[]
  /** Set while changes are reverted (undo); messages from this one on are hidden until redo. */
  revert?: Session['revert']
  busy: boolean
  error?: string
}

const empty: SessionState = { messages: [], permissions: [], questions: [], todos: [], busy: false }

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id)
  if (i === -1) return [...list, item]
  const next = list.slice()
  next[i] = item
  return next
}

/** opencode ids sort by creation time; events can arrive out of order, so keep messages sorted. */
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

function upsertMessage(s: SessionState, msg: ChatMessage): SessionState {
  return { ...s, messages: upsert(s.messages, msg).sort(byId) }
}

function upsertPart(s: SessionState, part: Part): SessionState {
  const msg = s.messages.find((m) => m.id === part.messageID) ?? { id: part.messageID, role: 'assistant' as const, parts: [] }
  return upsertMessage(s, { ...msg, parts: upsert(msg.parts, part).sort(byId) })
}

function messageError(info: Message): string | undefined {
  return info.role === 'assistant' && info.error ? errorText(info.error) : undefined
}

const tokensOf = (info: Message): ChatMessage['tokens'] => (info.role === 'assistant' ? info.tokens : undefined)

/**
 * Loads a session's history, then folds the live opencode event stream into
 * renderable state. Subscribes before fetching so nothing is missed in between.
 */
export function useSession(directory: string, sessionId: string | undefined): SessionState {
  const [state, setState] = useState<SessionState>(empty)

  useEffect(() => {
    setState(empty)
    if (!sessionId) return

    const unsubscribe = window.api.onAgentEvent((_dir, event) => {
      setState((s) => {
        switch (event.type) {
          case 'message.updated': {
            const { info } = event.properties
            if (info.sessionID !== sessionId) return s
            const prev = s.messages.find((m) => m.id === info.id)
            return upsertMessage(s, { id: info.id, role: info.role, parts: prev?.parts ?? [], error: messageError(info), tokens: tokensOf(info), time: info.time })
          }
          case 'message.part.updated': {
            const { part } = event.properties
            return part.sessionID === sessionId ? upsertPart(s, part) : s
          }
          // Streaming tokens: append to one string field (e.g. "text") of an existing part.
          case 'message.part.delta': {
            const { sessionID, messageID, partID, field, delta } = event.properties
            if (sessionID !== sessionId) return s
            const part = s.messages.find((m) => m.id === messageID)?.parts.find((p) => p.id === partID)
            if (!part) return s
            const prev = (part as unknown as Record<string, unknown>)[field]
            return upsertPart(s, { ...part, [field]: (typeof prev === 'string' ? prev : '') + delta } as Part)
          }
          case 'permission.asked':
            if (event.properties.sessionID !== sessionId) return s
            return { ...s, permissions: upsert(s.permissions, event.properties) }
          case 'message.removed':
            if (event.properties.sessionID !== sessionId) return s
            return { ...s, messages: s.messages.filter((m) => m.id !== event.properties.messageID) }
          case 'todo.updated':
            if (event.properties.sessionID !== sessionId) return s
            return { ...s, todos: event.properties.todos }
          case 'session.updated':
            if (!('info' in event.properties) || event.properties.info.id !== sessionId) return s
            return { ...s, revert: event.properties.info.revert }
          case 'question.asked':
            if (event.properties.sessionID !== sessionId) return s
            return { ...s, questions: upsert(s.questions, event.properties) }
          case 'question.replied':
          case 'question.rejected':
            return { ...s, questions: s.questions.filter((q) => q.id !== event.properties.requestID) }
          case 'permission.replied':
            return { ...s, permissions: s.permissions.filter((p) => p.id !== event.properties.requestID) }
          case 'session.status':
            if (event.properties.sessionID !== sessionId) return s
            return { ...s, busy: event.properties.status.type !== 'idle', error: undefined }
          case 'session.idle':
            if (event.properties.sessionID !== sessionId) return s
            return { ...s, busy: false }
          case 'session.error':
            if (event.properties.sessionID !== sessionId) return s
            return { ...s, busy: false, error: event.properties.error ? errorText(event.properties.error) : 'Unknown error' }
          default:
            return s
        }
      })
    })

    let cancelled = false
    window.api.getMessages(directory, sessionId).then((history) => {
      if (cancelled) return
      setState((s) => {
        // Live events may already have delivered newer copies; keep those.
        const loaded = history
          .filter((m) => !s.messages.some((x) => x.id === m.info.id))
          .map((m) => ({ id: m.info.id, role: m.info.role, parts: m.parts, error: messageError(m.info), tokens: tokensOf(m.info), time: m.info.time }))
        return { ...s, messages: [...loaded, ...s.messages].sort(byId) }
      })
    })

    window.api.oc<Todo[]>('session.todo', { directory, sessionID: sessionId }).then((todos) => !cancelled && setState((s) => ({ ...s, todos: todos ?? [] })))
    window.api.oc<Session>('session.get', { directory, sessionID: sessionId }).then((info) => !cancelled && setState((s) => ({ ...s, revert: info?.revert })))

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [directory, sessionId])

  return state
}

function errorText(err: { name: string; data?: unknown }): string {
  const data = err.data as { message?: string } | undefined
  return data?.message ? `${err.name}: ${data.message}` : err.name
}
