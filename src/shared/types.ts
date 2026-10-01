import type { FilePartInput, GlobalEvent, Message, Part, PermissionRequest, Session } from '@opencode-ai/sdk/v2'

export type { FilePartInput, PermissionRequest, Session }

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

/**
 * Codex-style access modes. Capy's main process approves covered permission requests as they
 * arrive, so a mode switch applies instantly to every chat, including tasks already running.
 * (opencode session rules can't do this: updates only append rules, and a running task keeps
 * the rules it started with.)
 */
export type AccessMode = 'ask' | 'auto' | 'full'

/** Tools "Auto-approve" allows inside the project. External paths and the web still follow settings. */
export const AUTO_APPROVED = ['read', 'edit', 'glob', 'grep', 'list', 'bash', 'task', 'skill', 'todowrite', 'lsp'] as const

/** Whether a pending approval of this kind is already covered by the mode. */
export const accessCovers = (mode: AccessMode, permission: string): boolean =>
  mode === 'full' || (mode === 'auto' && (AUTO_APPROVED as readonly string[]).includes(permission))

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
  /** Built-in browser use: Playwright MCP driving the user's Chrome. */
  browser: { enabled: boolean; headless: boolean }
  /** Goal mode: the opencode-goal-plugin (adds /goal, /pause_goal, /resume_goal). */
  goalMode: boolean
  /** Access mode for chats (see AccessMode). */
  accessMode: AccessMode
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
  /** Browser use drives Google Chrome; false if it isn't installed. */
  chromeInstalled: boolean
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
  /** Side chat: forks a chat (full context) into a hidden session that never writes back. */
  forkSideChat(directory: string, sessionId: string): Promise<Session>
  deleteSession(directory: string, sessionId: string): Promise<void>
  /** Sends a message; text starting with "/name" runs that command. */
  prompt(directory: string, sessionId: string, text: string, agent?: string, system?: string, files?: FilePartInput[]): Promise<void>
  abort(directory: string, sessionId: string): Promise<void>
  respondPermission(directory: string, requestId: string, response: PermissionResponse): Promise<void>
  /**
   * Calls an allow-listed opencode API method by its SDK path (e.g. "session.todo") and returns
   * its data. Capy's panels are thin views over these calls; see OC_METHODS in src/main/index.ts.
   */
  oc<T = unknown>(method: OcMethod, params: Record<string, unknown>): Promise<T>
  /** Starts a terminal (opencode PTY) in a folder; output arrives via onPtyData. */
  ptyOpen(directory: string, cols: number, rows: number): Promise<string>
  ptyWrite(ptyId: string, data: string): void
  ptyResize(directory: string, ptyId: string, cols: number, rows: number): void
  ptyClose(directory: string, ptyId: string): Promise<void>
  onPtyData(cb: (ptyId: string, data: string) => void): () => void
  onPtyExit(cb: (ptyId: string) => void): () => void
  /** Answers the agent's question tool: one list of chosen labels (or typed text) per question. */
  replyQuestion(directory: string, requestId: string, answers: string[][]): Promise<void>
  rejectQuestion(directory: string, requestId: string): Promise<void>
  /** Saves the access mode and approves any pending requests it covers. */
  setAccessMode(mode: AccessMode): Promise<void>
  onStatus(cb: (status: RuntimeStatus) => void): () => void
  onModelProgress(cb: (progress: ModelProgress) => void): () => void
  onAgentEvent(cb: (directory: string, event: AgentEvent) => void): () => void
}

/** opencode SDK methods the window may call through `oc` (everything else is main-process only). */
export const OC_METHODS = [
  'session.todo',
  'session.diff',
  'session.revert',
  'session.unrevert',
  'session.summarize',
  'session.shell',
  'session.children',
  'session.update',
  'session.get',
  'find.files',
  'find.text',
  'find.symbols',
  'file.list',
  'file.read',
  'vcs.get',
  'vcs.status',
  'vcs.diff',
  'worktree.list',
  'worktree.create',
  'worktree.remove',
  'worktree.reset',
  'mcp.auth.authenticate',
  'mcp.auth.remove',
  'mcp.connect',
  'mcp.disconnect',
  'experimental.resource.list'
] as const
export type OcMethod = (typeof OC_METHODS)[number]

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
  forkSideChat: 'agent:fork-side-chat',
  deleteSession: 'agent:delete-session',
  prompt: 'agent:prompt',
  abort: 'agent:abort',
  respondPermission: 'agent:respond-permission',
  setAccessMode: 'agent:set-access-mode',
  oc: 'opencode:call',
  ptyOpen: 'pty:open',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyClose: 'pty:close',
  ptyData: 'pty:data',
  ptyExit: 'pty:exit',
  replyQuestion: 'agent:reply-question',
  rejectQuestion: 'agent:reject-question',
  agentEvent: 'agent:event'
} as const
