import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '@shared/types'

export const DEFAULT_SETTINGS: AppSettings = {
  // The -mlx variant runs on Ollama's MLX engine (faster on Apple Silicon).
  model: 'qwen3.8:27b-mlx',
  // Agents need a large window; Ollama's 4K default silently truncates and breaks tool use.
  contextLength: 32_768,
  maxOutputTokens: 8192,
  // Anything that changes the machine goes through the approval UI by default.
  permissions: { edit: 'ask', bash: 'ask', webfetch: 'ask', external_directory: 'ask' },
  opencodeOverrides: '{}'
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

/** Reads settings.json from the app's data folder; missing keys fall back to defaults. */
export function loadSettings(): AppSettings {
  const saved = existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Partial<AppSettings>) : {}
  return { ...DEFAULT_SETTINGS, ...saved, permissions: { ...DEFAULT_SETTINGS.permissions, ...saved.permissions } }
}

export function saveSettings(settings: AppSettings): void {
  writeFileSync(file(), JSON.stringify(settings, null, 2))
}

/** Returns an error message if the overrides aren't a JSON object, else undefined. */
export function validateOverrides(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text || '{}')
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'Overrides must be a JSON object.'
  } catch (err) {
    return `Invalid JSON: ${(err as Error).message}`
  }
  return undefined
}
