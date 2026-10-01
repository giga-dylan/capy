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
  /** Reasoning levels the model accepts (from Ollama), e.g. [false, "low", "medium", "xhigh"]. */
  thinking?: { values: (string | boolean)[]; default?: string | boolean }
}

export type PermissionLevel = 'ask' | 'allow' | 'deny'

/** opencode config (opencode.ai/config.json). Kept loose here; the SDK's Config type is the reference. */
export type OpencodeConfig = Record<string, unknown>

export interface AppSettings {
  /** Active Ollama model tag. */
  model: string
  /** Ollama model store (OLLAMA_MODELS). Unset = ~/.ollama/models. */
  modelsDir?: string
  /** Context window (tokens) Ollama loads models with, and opencode plans around. */
  contextLength: number
  maxOutputTokens: number
  /** Chosen reasoning effort (opencode variant) per model; missing = the model's default. */
  reasoningEffort: Record<string, string>
  /** Let opencode load Claude Code's skills (~/.claude/skills). */
  claudeSkills: boolean
  /** Let opencode load Claude Code's rules (CLAUDE.md, ~/.claude/CLAUDE.md). */
  claudeRules: boolean
  /**
   * The user's opencode config layer, deep-merged over the config the app generates.
   * Every structured settings screen (permissions, MCP, agents, ...) edits this object.
   */
  opencode: OpencodeConfig
}

/** File-based opencode extensions, stored in the app's private opencode config folder. */
export type ExtensionKind = 'agent' | 'command' | 'skill' | 'plugin' | 'tool'

export interface ExtensionFile {
  kind: ExtensionKind
  /** Agent/command/skill/tool name (file stem; for skills, the folder name). Plugins keep their extension. */
  name: string
  path: string
  content: string
}

/** What the running opencode server has actually loaded (built-ins, files, MCP, ...). */
export interface RuntimeInventory {
  agents: { name: string; description?: string; mode: string; native?: boolean; hidden?: boolean }[]
  skills: { name: string; description?: string; location: string }[]
  commands: { name: string; description?: string; source?: string; agent?: string }[]
  mcp: Record<string, { status: string; error?: string }>
  tools: string[]
  lsp: { id: string; name: string; root: string; status: string }[]
  formatters: { name: string; extensions: string[]; enabled: boolean }[]
  errors: string[]
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
  /** Folder holding the app's global opencode files (AGENTS.md, agents/, skills/, ...). */
  opencodeConfigDir(): Promise<string>
  inspect(): Promise<RuntimeInventory>
  listExtensions(kind: ExtensionKind): Promise<ExtensionFile[]>
  /** Writes an extension file and restarts opencode so it's picked up. */
  saveExtension(kind: ExtensionKind, name: string, content: string): Promise<void>
  deleteExtension(kind: ExtensionKind, name: string): Promise<void>
  getRules(): Promise<string>
  saveRules(content: string): Promise<void>
  revealPath(path: string): Promise<void>
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
  /** Sends a message; text starting with "/name" runs that command. */
  prompt(directory: string, sessionId: string, text: string, agent?: string): Promise<void>
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
  opencodeConfigDir: 'opencode:config-dir',
  inspect: 'opencode:inspect',
  listExtensions: 'opencode:list-extensions',
  saveExtension: 'opencode:save-extension',
  deleteExtension: 'opencode:delete-extension',
  getRules: 'opencode:get-rules',
  saveRules: 'opencode:save-rules',
  revealPath: 'app:reveal-path',
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
