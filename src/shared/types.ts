import type { GlobalEvent, Message, Part, PermissionRequest, Session } from '@opencode-ai/sdk/v2'

export type { PermissionRequest, Session }

export interface StoredMessage {
  info: Message
  parts: Part[]
}

/** Anything on opencode's global event stream (bus events plus sync events). */
export type AgentEvent = GlobalEvent['payload']

export type ServiceState = 'stopped' | 'starting' | 'ready' | 'error'

export interface RuntimeStatus {
  ollama: ServiceState
  opencode: ServiceState
  /** Active model. */
  model: string
  /** False until at least one model is installed (the app shows first-run setup). */
  hasModels: boolean
  error?: string
}

/** Progress for a model download or import, keyed by model name. */
export interface ModelProgress {
  model: string
  status: string
  completed?: number
  total?: number
  done?: boolean
  error?: string
}

export interface InstalledModel {
  name: string
  /** Bytes on disk. */
  size: number
  format: string
  quantization: string
  /** e.g. completion, tools, thinking, vision. Agents need "tools". */
  capabilities: string[]
}

export type PermissionLevel = 'ask' | 'allow' | 'deny'
export const PERMISSION_KEYS = ['edit', 'bash', 'webfetch', 'external_directory'] as const
export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export interface AppSettings {
  /** Active Ollama model tag. */
  model: string
  /** Ollama model store (OLLAMA_MODELS). Unset = ~/.ollama/models. */
  modelsDir?: string
  /** Context window (tokens) Ollama loads models with, and opencode plans around. */
  contextLength: number
  maxOutputTokens: number
  permissions: Record<PermissionKey, PermissionLevel>
  /** Raw JSON object deep-merged over the generated opencode config. */
  opencodeOverrides: string
}

export type SaveResult = { ok: true; settings: AppSettings } | { ok: false; error: string }

export type PermissionResponse = 'once' | 'always' | 'reject'

/** The API exposed to the renderer on `window.api` (see src/preload). */
export interface CapyApi {
  getStatus(): Promise<RuntimeStatus>
  getSettings(): Promise<AppSettings>
  /** Validates, saves and applies settings (restarting services as needed). */
  saveSettings(patch: Partial<AppSettings>): Promise<SaveResult>
  /** The final opencode config the app runs with (base + overrides). */
  getEffectiveConfig(): Promise<unknown>
  chooseModelsDir(): Promise<string | null>
  listModels(): Promise<InstalledModel[]>
  pullModel(name: string): Promise<void>
  /** Opens a picker for a model folder (MLX/safetensors) or .gguf file and imports it. */
  importModel(): Promise<string | null>
  deleteModel(name: string): Promise<void>
  /** Folder used for chats that aren't attached to a project. */
  chatsDirectory(): Promise<string>
  listProjects(): Promise<string[]>
  /** Opens a folder picker; returns the added folder, or null if cancelled. */
  addProject(): Promise<string | null>
  removeProject(directory: string): Promise<void>
  listSessions(directory: string): Promise<Session[]>
  getMessages(directory: string, sessionId: string): Promise<StoredMessage[]>
  createSession(directory: string): Promise<Session>
  deleteSession(directory: string, sessionId: string): Promise<void>
  prompt(directory: string, sessionId: string, text: string): Promise<void>
  abort(directory: string, sessionId: string): Promise<void>
  respondPermission(directory: string, requestId: string, response: PermissionResponse): Promise<void>
  onStatus(cb: (status: RuntimeStatus) => void): () => void
  onModelProgress(cb: (progress: ModelProgress) => void): () => void
  onAgentEvent(cb: (directory: string, event: AgentEvent) => void): () => void
}

export const IPC = {
  getStatus: 'runtime:get-status',
  status: 'runtime:status',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  getEffectiveConfig: 'settings:effective-config',
  chooseModelsDir: 'settings:choose-models-dir',
  listModels: 'models:list',
  pullModel: 'models:pull',
  importModel: 'models:import',
  deleteModel: 'models:delete',
  modelProgress: 'models:progress',
  chatsDirectory: 'project:chats-directory',
  listProjects: 'project:list',
  addProject: 'project:add',
  removeProject: 'project:remove',
  listSessions: 'agent:list-sessions',
  getMessages: 'agent:get-messages',
  createSession: 'agent:create-session',
  deleteSession: 'agent:delete-session',
  prompt: 'agent:prompt',
  abort: 'agent:abort',
  respondPermission: 'agent:respond-permission',
  agentEvent: 'agent:event'
} as const
