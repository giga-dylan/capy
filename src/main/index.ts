import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  accessCovers,
  IPC,
  OC_METHODS,
  type AccessMode,
  type AppSettings,
  type FilePartInput,
  type ExtensionKind,
  type InstalledModel,
  type ModelProgress,
  type PermissionResponse,
  type RuntimeInventory,
  type RuntimeStatus,
  type SaveResult
} from '@shared/types'
import { OllamaRuntime } from './ollama'
import { buildConfig, CHROME_PATH, effortVariants, OpencodeRuntime, PROVIDER_ID } from './opencode'
import { chatsDirectory, ProjectStore } from './projects'
import { deleteExtension, listExtensions, opencodeConfigDir, readRules, writeExtension, writeRules } from './extensions'
import { isPlainObject, loadSettings, saveSettings } from './settings'
import { Updater } from './updater'

const ollama = new OllamaRuntime()
const opencode = new OpencodeRuntime()
const projects = new ProjectStore()
const updater = new Updater((state) => win?.webContents.send(IPC.updateState, state))
let win: BrowserWindow | undefined
let settings: AppSettings
let models: InstalledModel[] = []

const status: RuntimeStatus = { ollama: 'stopped', opencode: 'stopped', model: '', hasModels: false }

function setStatus(patch: Partial<RuntimeStatus>): void {
  Object.assign(status, patch)
  win?.webContents.send(IPC.status, status)
}

function sendProgress(p: ModelProgress): void {
  win?.webContents.send(IPC.modelProgress, p)
}

const SIDE_CHAT_KEY = 'capySideChatOf'

/** Open terminal sockets by PTY id. */
const ptys = new Map<string, WebSocket>()

/** Approval requests waiting for an answer, so a mode switch can approve them. */
const pendingPermissions = new Map<string, { directory: string; permission: string }>()

function autoApprove(directory: string, requestID: string): void {
  pendingPermissions.delete(requestID)
  opencode.client.permission
    .reply({ directory, requestID, reply: 'once' })
    .catch((err) => console.error('[opencode] auto-approve failed', err))
}

/** Restarts/reconfigurations run one at a time so services never overlap. */
let queue: Promise<unknown> = Promise.resolve()
function serially<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn)
  queue = next.catch(() => undefined)
  return next
}

/** Reloads the installed-model list and keeps the active model valid. */
async function refreshModels(): Promise<void> {
  models = await ollama.listModels()
  if (models.length && !models.some((m) => m.name === settings.model)) {
    const fallback = models.find((m) => m.capabilities.includes('tools')) ?? models[0]
    settings = { ...settings, model: fallback.name }
    saveSettings(settings)
  }
  setStatus({ model: settings.model, hasModels: models.length > 0 })
}

async function startOllama(restart = false): Promise<void> {
  setStatus({ ollama: 'starting', error: undefined })
  const options = { modelsDir: settings.modelsDir, contextLength: settings.contextLength }
  await (restart ? ollama.restart(options) : ollama.start(options))
  setStatus({ ollama: 'ready' })
  await refreshModels()
}

async function startOpencode(restart = false): Promise<void> {
  setStatus({ opencode: 'starting', error: undefined })
  if (restart) await opencode.stop()
  await opencode.start(buildConfig(settings, ollama.baseUrl, models), {
    ...(!settings.claudeSkills && { OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: '1' }),
    ...(!settings.claudeRules && { OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: '1' })
  })
  setStatus({ opencode: 'ready' })
  pendingPermissions.clear()
  opencode
    .streamEvents((directory, event) => {
      if (event.type === 'permission.asked') {
        const { id, permission } = event.properties
        pendingPermissions.set(id, { directory, permission })
        // Covered by the access mode: approve here; the window never shows a card.
        if (accessCovers(settings.accessMode, permission)) return autoApprove(directory, id)
      }
      if (event.type === 'permission.replied') pendingPermissions.delete(event.properties.requestID)
      // MCP OAuth: if opencode couldn't open the sign-in page itself, open it from here.
      if (event.type === 'mcp.browser.open.failed') void shell.openExternal(event.properties.url)
      win?.webContents.send(IPC.agentEvent, directory, event)
    })
    .catch((err) => (err as Error).name !== 'AbortError' && console.error('[opencode] event stream ended', err))
}

function reportFailure(err: unknown): void {
  console.error(err)
  setStatus({
    error: String(err),
    ollama: status.ollama === 'ready' ? 'ready' : 'error',
    opencode: status.opencode === 'ready' ? 'ready' : 'error'
  })
}

function bootRuntimes(): Promise<void> {
  return serially(async () => {
    await startOllama()
    await startOpencode()
  }).catch(reportFailure)
}

/** opencode reads config and extension files at startup, so changes need a restart. */
const restartOpencode = (): Promise<void> => serially(() => startOpencode(true))

/** What the running server has loaded, as seen from the no-folder chats workspace. */
async function inspect(): Promise<RuntimeInventory> {
  const directory = chatsDirectory()
  const c = opencode.client
  const [agents, skills, commands, mcp, tools, lsp, formatters] = await Promise.allSettled([
    c.app.agents({ directory }),
    c.app.skills({ directory }),
    c.command.list({ directory }),
    c.mcp.status({ directory }),
    c.tool.ids({ directory }),
    c.lsp.status({ directory }),
    c.formatter.status({ directory })
  ])
  const errors: string[] = []
  const value = <T>(r: PromiseSettledResult<{ data?: T }>, fallback: T): T => {
    if (r.status === 'fulfilled') return r.value.data ?? fallback
    errors.push(String(r.reason))
    return fallback
  }
  return {
    agents: value(agents, []).map(({ name, description, mode, native, hidden }) => ({ name, description, mode, native, hidden })),
    skills: value(skills, []).map(({ name, description, location }) => ({ name, description, location })),
    commands: value(commands, []).map(({ name, description, source, agent }) => ({ name, description, source, agent })),
    mcp: Object.fromEntries(
      Object.entries(value(mcp, {})).map(([name, st]) => [name, { status: st.status, error: 'error' in st ? st.error : undefined }])
    ),
    tools: value(tools, []),
    lsp: value(lsp, []),
    formatters: value(formatters, []),
    chromeInstalled: existsSync(CHROME_PATH),
    errors
  }
}

/** opencode needs a restart to see added/removed models. */
const afterModelsChanged = (): Promise<void> =>
  serially(async () => {
    await refreshModels()
    await startOpencode(true)
  })

async function applySettings(patch: Partial<AppSettings>): Promise<SaveResult> {
  const next: AppSettings = { ...settings, ...patch }
  if (!isPlainObject(next.opencode)) return { ok: false, error: 'The opencode config must be a JSON object.' }
  if (!(next.contextLength >= 2048) || !(next.maxOutputTokens >= 256)) return { ok: false, error: 'Context must be ≥ 2048 and output ≥ 256 tokens.' }

  const changed = (keys: (keyof AppSettings)[]): boolean => keys.some((k) => JSON.stringify(next[k]) !== JSON.stringify(settings[k]))
  const restartOllama = changed(['modelsDir', 'contextLength'])
  // The active model is sent with each prompt, so switching it needs no restart.
  const restartOpencode = restartOllama || changed(['maxOutputTokens', 'opencode', 'claudeSkills', 'claudeRules', 'browser', 'goalMode'])

  settings = next
  saveSettings(settings)
  setStatus({ model: settings.model })
  try {
    await serially(async () => {
      if (restartOllama) await startOllama(true)
      if (restartOpencode) await startOpencode(true)
    })
  } catch (err) {
    reportFailure(err)
    return { ok: false, error: `Saved, but a service failed to restart: ${String(err)}` }
  }
  return { ok: true, settings }
}

/** Ollama model names: lowercase letters, digits, and . _ - (plus one optional :tag). */
function modelNameFrom(path: string): string {
  const stem = basename(path).replace(/\.gguf$/i, '')
  return stem.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'imported-model'
}

/** A picked folder may be an MLX/safetensors model, or a folder holding a single .gguf file. */
function importSource(path: string): string {
  if (!statSync(path).isDirectory()) return path
  const ggufs = readdirSync(path).filter((f) => f.toLowerCase().endsWith('.gguf'))
  return ggufs.length === 1 ? join(path, ggufs[0]) : path
}

function registerIpc(): void {
  ipcMain.handle(IPC.getStatus, () => status)
  ipcMain.handle(IPC.getSettings, () => settings)
  ipcMain.handle(IPC.getUpdateState, () => updater.state)
  ipcMain.handle(IPC.checkForUpdates, () => updater.check())
  ipcMain.handle(IPC.installUpdate, () => updater.install())
  ipcMain.handle(IPC.saveSettings, (_e, patch: Partial<AppSettings>) => applySettings(patch))
  ipcMain.handle(IPC.getEffectiveConfig, () => buildConfig(settings, ollama.baseUrl, models))
  ipcMain.handle(IPC.opencodeConfigDir, () => opencodeConfigDir())
  ipcMain.handle(IPC.inspect, () => inspect())
  ipcMain.handle(IPC.listExtensions, (_e, kind: ExtensionKind) => listExtensions(kind))
  ipcMain.handle(IPC.saveExtension, async (_e, kind: ExtensionKind, name: string, content: string) => {
    writeExtension(kind, name, content)
    await restartOpencode()
  })
  ipcMain.handle(IPC.deleteExtension, async (_e, kind: ExtensionKind, name: string) => {
    deleteExtension(kind, name)
    await restartOpencode()
  })
  ipcMain.handle(IPC.getRules, () => readRules())
  ipcMain.handle(IPC.saveRules, async (_e, content: string) => {
    writeRules(content)
    await restartOpencode()
  })
  ipcMain.handle(IPC.revealPath, (_e, path: string) => shell.showItemInFolder(path))

  ipcMain.handle(IPC.chooseModelsDir, async () => {
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], message: 'Choose where Ollama stores models' })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle(IPC.listModels, () => models)

  ipcMain.handle(IPC.pullModel, async (_e, name: string) => {
    try {
      await ollama.pull(name, sendProgress)
      await afterModelsChanged()
      sendProgress({ model: name, status: 'Installed', done: true })
    } catch (err) {
      sendProgress({ model: name, status: 'Failed', done: true, error: String(err) })
      throw err
    }
  })

  ipcMain.handle(IPC.importModel, async () => {
    const res = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'openFile'],
      filters: [{ name: 'Model', extensions: ['gguf'] }],
      message: 'Choose an MLX/safetensors model folder or a .gguf file'
    })
    if (res.canceled) return null
    const source = importSource(res.filePaths[0])
    const name = modelNameFrom(res.filePaths[0])
    try {
      await ollama.import(source, name, sendProgress)
      await afterModelsChanged()
      sendProgress({ model: name, status: 'Imported', done: true })
      return name
    } catch (err) {
      sendProgress({ model: name, status: 'Failed', done: true, error: String(err) })
      throw err
    }
  })

  ipcMain.handle(IPC.deleteModel, async (_e, name: string) => {
    await ollama.delete(name)
    await afterModelsChanged()
  })

  ipcMain.handle(IPC.chatsDirectory, () => chatsDirectory())
  ipcMain.handle(IPC.listProjects, () => projects.list())
  ipcMain.handle(IPC.removeProject, (_e, directory: string) => projects.remove(directory))
  ipcMain.handle(IPC.addProject, async () => {
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled) return null
    projects.add(res.filePaths[0])
    return res.filePaths[0]
  })

  // Top-level chats only (no subagent children or side chats). Non-git folders share opencode's
  // "global" project, so filter to sessions that actually live in this folder.
  ipcMain.handle(IPC.listSessions, async (_e, directory: string) => {
    const { data } = await opencode.client.session.list({ directory, roots: true })
    return (data ?? [])
      .filter((s) => s.directory === directory && !s.metadata?.[SIDE_CHAT_KEY])
      .sort((a, b) => b.time.updated - a.time.updated)
  })

  // Side chat = opencode's own session fork (full context, separate thread), tagged so the
  // sidebar hides it. Native /btw arrives with opencode 2.0.
  ipcMain.handle(IPC.forkSideChat, async (_e, directory: string, sessionID: string) => {
    const { data: fork } = await opencode.client.session.fork({ directory, sessionID })
    if (!fork) throw new Error('Could not fork the chat')
    const { data } = await opencode.client.session.update({ directory, sessionID: fork.id, title: 'Side chat', metadata: { [SIDE_CHAT_KEY]: sessionID } })
    return data
  })

  ipcMain.handle(IPC.getMessages, async (_e, directory: string, sessionID: string) => {
    const { data } = await opencode.client.session.messages({ directory, sessionID })
    return data
  })

  ipcMain.handle(IPC.createSession, async (_e, directory: string) => {
    const { data } = await opencode.client.session.create({ directory })
    return data
  })

  ipcMain.handle(IPC.deleteSession, async (_e, directory: string, sessionID: string) => {
    await opencode.client.session.delete({ directory, sessionID })
  })

  // Generic, allow-listed bridge to opencode's API for the window's panels.
  ipcMain.handle(IPC.oc, async (_e, method: string, params: Record<string, unknown>) => {
    if (!(OC_METHODS as readonly string[]).includes(method)) throw new Error(`opencode method not allowed: ${method}`)
    const path = method.split('.')
    let owner: Record<string, unknown> = opencode.client as unknown as Record<string, unknown>
    for (const key of path.slice(0, -1)) owner = owner[key] as Record<string, unknown>
    const fn = owner[path[path.length - 1]] as (p: unknown) => Promise<{ data: unknown }>
    const { data } = await fn.call(owner, params)
    return data
  })

  // Terminal: opencode PTYs, relayed over a WebSocket opened here (it needs the password header).
  ipcMain.handle(IPC.ptyOpen, async (_e, directory: string, cols: number, rows: number) => {
    const { data: pty } = await opencode.client.pty.create({ directory, cwd: directory, title: 'Terminal' })
    if (!pty) throw new Error('Could not start a terminal')
    const ws = opencode.connectPty(directory, pty.id)
    ws.binaryType = 'arraybuffer'
    // Text frames are terminal output; binary frames are opencode control messages (cursor).
    ws.onmessage = (m) => typeof m.data === 'string' && win?.webContents.send(IPC.ptyData, pty.id, m.data)
    ws.onclose = () => {
      ptys.delete(pty.id)
      win?.webContents.send(IPC.ptyExit, pty.id)
    }
    ptys.set(pty.id, ws)
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('Could not connect to the terminal'))
    })
    void opencode.client.pty.update({ directory, ptyID: pty.id, size: { cols, rows } })
    return pty.id
  })
  ipcMain.on(IPC.ptyWrite, (_e, ptyID: string, data: string) => ptys.get(ptyID)?.send(data))
  ipcMain.on(IPC.ptyResize, (_e, directory: string, ptyID: string, cols: number, rows: number) => {
    void opencode.client.pty.update({ directory, ptyID, size: { cols, rows } }).catch(() => undefined)
  })
  ipcMain.handle(IPC.ptyClose, async (_e, directory: string, ptyID: string) => {
    ptys.get(ptyID)?.close()
    ptys.delete(ptyID)
    await opencode.client.pty.remove({ directory, ptyID }).catch(() => undefined)
  })

  // The agent's question tool. Never auto-answered, whatever the access mode.
  ipcMain.handle(IPC.replyQuestion, async (_e, directory: string, requestID: string, answers: string[][]) => {
    await opencode.client.question.reply({ directory, requestID, answers })
  })
  ipcMain.handle(IPC.rejectQuestion, async (_e, directory: string, requestID: string) => {
    await opencode.client.question.reject({ directory, requestID })
  })

  ipcMain.handle(IPC.setAccessMode, (_e, mode: AccessMode) => {
    settings = { ...settings, accessMode: mode }
    saveSettings(settings)
    for (const [requestID, p] of pendingPermissions) if (accessCovers(mode, p.permission)) autoApprove(p.directory, requestID)
  })

  // Both return immediately; progress arrives on the event stream.
  ipcMain.handle(IPC.prompt, async (_e, directory: string, sessionID: string, text: string, agent?: string, system?: string, files: FilePartInput[] = []) => {
    const model = { providerID: PROVIDER_ID, modelID: settings.model }
    // Only send a variant the active model actually has (efforts are saved per model).
    const active = models.find((m) => m.name === settings.model)
    const effort = settings.reasoningEffort[settings.model]
    const variant = active && effort && effortVariants(active)?.[effort] ? effort : undefined
    const slash = /^\/(\S+)\s*([\s\S]*)$/.exec(text.trim())
    if (slash) {
      const { data: commands } = await opencode.client.command.list({ directory })
      if (commands?.some((c) => c.name === slash[1])) {
        // Fire and forget: session.command resolves only when the run finishes.
        void opencode.client.session
          .command({ directory, sessionID, command: slash[1], arguments: slash[2], agent, variant, model: `${PROVIDER_ID}/${settings.model}`, parts: files })
          .catch((err) => console.error('[opencode] command failed', err))
        return
      }
    }
    await opencode.client.session.promptAsync({ directory, sessionID, agent, model, variant, system, parts: [{ type: 'text', text }, ...files] })
  })

  ipcMain.handle(IPC.abort, async (_e, directory: string, sessionID: string) => {
    await opencode.client.session.abort({ directory, sessionID })
  })

  ipcMain.handle(IPC.respondPermission, async (_e, directory: string, requestID: string, reply: PermissionResponse) => {
    await opencode.client.permission.reply({ directory, requestID, reply })
  })
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    // Sidebar (256) + chat (360 min) + side chat (280 min).
    minWidth: 900,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b0b0c',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true
    }
  })
  // Surface renderer problems in the terminal; a blank window is otherwise silent.
  win.webContents.on('console-message', ({ level, message, sourceId, lineNumber }) => {
    if (level === 'warning' || level === 'error') console.log(`[renderer:${level}] ${message} (${sourceId}:${lineNumber})`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => console.error(`[renderer] failed to load ${url}: ${desc} (${code})`))
  win.webContents.on('render-process-gone', (_e, details) => console.error('[renderer] process gone', details))
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

// Dev aid: CAPY_DEBUG_PORT=9222 npm run dev exposes Chrome DevTools Protocol for inspecting the renderer.
if (process.env.CAPY_DEBUG_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.CAPY_DEBUG_PORT)

app.whenReady().then(() => {
  // Packaged builds get the icon from the bundle; in dev, show it in the Dock too.
  if (!app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build', 'icon.png'))
  settings = loadSettings()
  registerIpc()
  createWindow()
  bootRuntimes()
  void updater.start()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => app.quit())

app.on('before-quit', () => {
  for (const ws of ptys.values()) ws.close()
  void opencode.stop()
  ollama.stop()
})
