import type { ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
// v2 client: matches the events the 1.18 server actually emits (permission.asked, message.part.delta, ...).
import { app } from 'electron'
import { createOpencodeClient, type Config, type McpLocalConfig, type OpencodeClient } from '@opencode-ai/sdk/v2'
import type { AgentEvent, AppSettings, InstalledModel } from '@shared/types'
import { binDir } from './config'
import { opencodeHome } from './extensions'
import { freePort, spawnService, stopProcess, waitFor } from './process'
import { isPlainObject } from './settings'

export const PROVIDER_ID = 'ollama'

/**
 * The opencode config the app runs with: every installed Ollama model is registered so the
 * user can switch models per message, then the user's raw overrides are deep-merged on top.
 */
export function buildConfig(settings: AppSettings, ollamaBaseUrl: string, models: InstalledModel[]): Config {
  const base: Config = {
    $schema: 'https://opencode.ai/config.json',
    model: `${PROVIDER_ID}/${settings.model}`,
    // Titles/summaries use the "small model". Pin it and allow only our local provider so
    // opencode never falls back to a cloud provider it finds via env vars (e.g. an API key).
    small_model: `${PROVIDER_ID}/${settings.model}`,
    enabled_providers: [PROVIDER_ID],
    autoupdate: false,
    share: 'disabled',
    provider: {
      [PROVIDER_ID]: {
        npm: '@ai-sdk/openai-compatible',
        name: 'Ollama (bundled)',
        options: { baseURL: `${ollamaBaseUrl}/v1` },
        models: Object.fromEntries(
          models.map((m) => [
            m.name,
            {
              name: m.name,
              tool_call: m.capabilities.includes('tools'),
              reasoning: m.capabilities.includes('thinking'),
              attachment: m.capabilities.includes('vision'),
              // opencode only sends images to models whose input modalities include them.
              ...(m.capabilities.includes('vision') && { modalities: { input: ['text', 'image'], output: ['text'] } }),
              limit: { context: settings.contextLength, output: settings.maxOutputTokens },
              variants: effortVariants(m)
            }
          ])
        )
      }
    }
  }
  const config = deepMerge(base, settings.opencode) as Config
  // Built-in extras are plain opencode config: an MCP server and an npm plugin. They're added
  // after the merge so the user's own `mcp` / `plugin` entries don't replace them.
  if (settings.browser.enabled && !config.mcp?.browser) config.mcp = { ...config.mcp, browser: browserMcp(settings) }
  if (settings.goalMode) {
    const plugins = config.plugin ?? []
    if (!plugins.some((p) => (Array.isArray(p) ? p[0] : p).startsWith(GOAL_PLUGIN_NAME))) config.plugin = [...plugins, GOAL_PLUGIN]
  }
  return config
}

/** Goal mode (Codex-style /goal) isn't in opencode itself; this plugin adds it via opencode's plugin system. */
const GOAL_PLUGIN_NAME = '@prevalentware/opencode-goal-plugin'
const GOAL_PLUGIN = `${GOAL_PLUGIN_NAME}@0.1.53`

export const CHROME_PATH = '/Applications/Google Chrome.app'

/**
 * Browser use via Microsoft's Playwright MCP (bundled), run with Electron's built-in Node so users
 * don't need Node.js. It drives the user's Google Chrome with a profile private to Capy.
 */
function browserMcp(settings: AppSettings): McpLocalConfig {
  const root = app.isPackaged ? app.getAppPath().replace('app.asar', 'app.asar.unpacked') : app.getAppPath()
  const data = app.getPath('userData')
  return {
    type: 'local',
    command: [
      process.execPath,
      join(root, 'node_modules', '@playwright', 'mcp', 'cli.js'),
      '--browser=chrome',
      `--user-data-dir=${join(data, 'browser', 'profile')}`,
      `--output-dir=${join(data, 'browser', 'output')}`,
      ...(settings.browser.headless ? ['--headless'] : [])
    ],
    environment: { ELECTRON_RUN_AS_NODE: '1' }
  }
}

/**
 * One opencode variant per reasoning level Ollama reports for the model (/api/show "thinking").
 * opencode sends the variant's `reasoningEffort` as `reasoning_effort` on /v1/chat/completions.
 * Tested against Ollama 0.35: "none" turns thinking off; on on/off models any other value turns it
 * on (so `true` -> "on"); named levels pass through. Ollama silently ignores values a model doesn't
 * support, so only reported levels get variants. Models that think but report no levels (e.g.
 * deepseek-r1) ignore reasoning_effort entirely and get none.
 */
export function effortVariants(m: InstalledModel): Record<string, { reasoningEffort: string }> | undefined {
  const levels = (m.thinking?.values ?? []).map((v): [string, string] => (v === false ? ['off', 'none'] : v === true ? ['on', 'medium'] : [v, v]))
  return levels.length ? Object.fromEntries(levels.map(([name, effort]) => [name, { reasoningEffort: effort }])) : undefined
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (!isPlainObject(target) || !isPlainObject(source)) return source
  const out: Record<string, unknown> = { ...target }
  for (const [key, value] of Object.entries(source)) out[key] = key in out ? deepMerge(out[key], value) : value
  return out
}

/**
 * Runs the bundled `opencode serve` and talks to it over HTTP via the SDK.
 * We spawn it ourselves (instead of the SDK's createOpencode) so we control
 * the binary path, port, data directory and auth.
 */
export class OpencodeRuntime {
  private proc?: ChildProcess
  private abortEvents?: AbortController
  /** Per-launch password so other local processes can't drive the agent. */
  private readonly password = randomBytes(24).toString('hex')
  private readonly authHeader = `Basic ${Buffer.from(`opencode:${this.password}`).toString('base64')}`
  baseUrl = ''
  client!: OpencodeClient

  async start(config: Config, env: NodeJS.ProcessEnv = {}): Promise<void> {
    const port = await freePort()
    this.baseUrl = `http://127.0.0.1:${port}`
    // Keep opencode's data/config private to the app so it never collides with
    // (or reads config from) a user's own opencode install.
    const home = opencodeHome()
    this.proc = spawnService('opencode', join(binDir(), 'opencode'), ['serve', '--hostname=127.0.0.1', `--port=${port}`], {
      env: {
        ...process.env,
        ...env,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
        OPENCODE_SERVER_PASSWORD: this.password,
        XDG_DATA_HOME: join(home, 'data'),
        XDG_CONFIG_HOME: join(home, 'config'),
        XDG_STATE_HOME: join(home, 'state'),
        XDG_CACHE_HOME: join(home, 'cache')
      }
    })
    const headers = { Authorization: this.authHeader }
    await waitFor(async () => (await fetch(`${this.baseUrl}/doc`, { headers })).ok, 20_000, 'opencode')
    // Calls take the project directory as a parameter, so one client serves every project.
    this.client = createOpencodeClient({ baseUrl: this.baseUrl, throwOnError: true, headers })
  }

  /** Subscribes to the global SSE stream (events for every project directory). Ends on stop(). */
  async streamEvents(onEvent: (directory: string, event: AgentEvent) => void): Promise<void> {
    this.abortEvents = new AbortController()
    const { stream } = await this.client.global.event({ signal: this.abortEvents.signal })
    for await (const { directory, payload } of stream) onEvent(directory, payload)
  }

  /** Opens an opencode PTY's WebSocket (with the password header, which browsers can't send). */
  connectPty(directory: string, ptyID: string): WebSocket {
    const url = `${this.baseUrl.replace('http', 'ws')}/pty/${ptyID}/connect?directory=${encodeURIComponent(directory)}`
    // Node's WebSocket (undici) accepts headers; the browser API does not.
    return new WebSocket(url, { headers: { Authorization: this.authHeader } } as unknown as string[])
  }

  async stop(): Promise<void> {
    this.abortEvents?.abort()
    await stopProcess(this.proc)
  }
}
