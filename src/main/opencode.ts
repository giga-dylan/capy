import type { ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { app } from 'electron'
// v2 client: matches the events the 1.18 server actually emits (permission.asked, message.part.delta, ...).
import { createOpencodeClient, type Config, type OpencodeClient } from '@opencode-ai/sdk/v2'
import type { AgentEvent, AppSettings, InstalledModel } from '@shared/types'
import { binDir } from './config'
import { freePort, spawnService, stopProcess, waitFor } from './process'

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
              limit: { context: settings.contextLength, output: settings.maxOutputTokens }
            }
          ])
        )
      }
    },
    permission: { ...settings.permissions }
  }
  return deepMerge(base, JSON.parse(settings.opencodeOverrides || '{}')) as Config
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (!isObject(target) || !isObject(source)) return source
  const out: Record<string, unknown> = { ...target }
  for (const [key, value] of Object.entries(source)) out[key] = key in out ? deepMerge(out[key], value) : value
  return out
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
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

  async start(config: Config): Promise<void> {
    const port = await freePort()
    this.baseUrl = `http://127.0.0.1:${port}`
    // Keep opencode's data/config private to the app so it never collides with
    // (or reads config from) a user's own opencode install.
    const home = join(app.getPath('userData'), 'opencode')
    this.proc = spawnService('opencode', join(binDir(), 'opencode'), ['serve', '--hostname=127.0.0.1', `--port=${port}`], {
      env: {
        ...process.env,
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

  async stop(): Promise<void> {
    this.abortEvents?.abort()
    await stopProcess(this.proc)
  }
}
