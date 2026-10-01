import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings, OpencodeConfig } from '@shared/types'

export const DEFAULT_SETTINGS: AppSettings = {
  // The -mlx variant runs on Ollama's MLX engine (faster on Apple Silicon).
  model: 'qwen3.8:27b-mlx',
  // Agents need a large window; Ollama's 4K default silently truncates and breaks tool use.
  contextLength: 32_768,
  maxOutputTokens: 8192,
  reasoningEffort: {},
  accessMode: 'ask',
  browser: { enabled: true, headless: true },
  goalMode: true,
  // Off so Capy only uses what's configured in Capy (and keeps prompts small for local models).
  claudeSkills: false,
  claudeRules: false,
  // Anything that changes the machine goes through the approval UI by default.
  opencode: { permission: { edit: 'ask', bash: 'ask', webfetch: 'ask', external_directory: 'ask' } }
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

/** Earlier versions stored `permissions` and a raw `opencodeOverrides` string separately. */
type LegacySettings = Partial<AppSettings> & { permissions?: Record<string, string>; opencodeOverrides?: string }

/** Reads settings.json from the app's data folder; missing keys fall back to defaults. */
export function loadSettings(): AppSettings {
  const saved: LegacySettings = existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : {}
  const { permissions, opencodeOverrides, ...rest } = saved
  let opencode: OpencodeConfig = rest.opencode ?? DEFAULT_SETTINGS.opencode
  if (!rest.opencode && (permissions || opencodeOverrides)) {
    const overrides = opencodeOverrides ? (JSON.parse(opencodeOverrides) as OpencodeConfig) : {}
    opencode = { ...overrides, permission: { ...permissions, ...(overrides.permission as object) } }
  }
  return { ...DEFAULT_SETTINGS, ...rest, browser: { ...DEFAULT_SETTINGS.browser, ...rest.browser }, opencode }
}

export function saveSettings(settings: AppSettings): void {
  writeFileSync(file(), JSON.stringify(settings, null, 2))
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
