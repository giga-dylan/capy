import { useEffect, useState } from 'react'
import type { Message, Part, PermissionRequest } from '@opencode-ai/sdk/v2'

export interface ChatMessage {
  id: string
  role: Message['role']
  parts: Part[]
  error?: string
}

interface SessionState {
  messages: ChatMessage[]
  permissions: PermissionRequest[]
  busy: boolean
  error?: string
}

const empty: SessionState = { messages: [], permissions: [], busy: false }

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
            return upsertMessage(s, { id: info.id, role: info.role, parts: prev?.parts ?? [], error: messageError(info) })
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
          .map((m) => ({ id: m.info.id, role: m.info.role, parts: m.parts, error: messageError(m.info) }))
        return { ...s, messages: [...loaded, ...s.messages].sort(byId) }
      })
    })

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
