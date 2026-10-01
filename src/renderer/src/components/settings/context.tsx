import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { AppSettings, OpencodeConfig, RuntimeInventory, SaveResult } from '@shared/types'

interface SettingsContextValue {
  settings: AppSettings
  /** What the running opencode server has loaded; refreshed after every restart. */
  inventory?: RuntimeInventory
  save: (patch: Partial<AppSettings>) => Promise<SaveResult>
  /** Saves a modified copy of the opencode config layer (restarts opencode). */
  updateOpencode: (mutate: (config: OpencodeConfig) => void) => Promise<SaveResult>
  refreshInventory: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>')
  return value
}

export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element | null {
  const [settings, setSettings] = useState<AppSettings>()
  const [inventory, setInventory] = useState<RuntimeInventory>()

  const refreshInventory = useCallback(() => void window.api.inspect().then(setInventory).catch(() => undefined), [])

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    refreshInventory()
    return window.api.onStatus((status) => {
      window.api.getSettings().then(setSettings)
      if (status.opencode === 'ready') refreshInventory()
    })
  }, [refreshInventory])

  const save = useCallback(async (patch: Partial<AppSettings>) => {
    const res = await window.api.saveSettings(patch)
    if (res.ok) setSettings(res.settings)
    refreshInventory()
    return res
  }, [refreshInventory])

  const updateOpencode = useCallback(
    async (mutate: (config: OpencodeConfig) => void) => {
      const config = structuredClone(settings?.opencode ?? {})
      mutate(config)
      return save({ opencode: config })
    },
    [settings, save]
  )

  if (!settings) return null
  return <SettingsContext.Provider value={{ settings, inventory, save, updateOpencode, refreshInventory }}>{children}</SettingsContext.Provider>
}

/** Reads a nested object from the config layer, e.g. obj(config, 'agent', 'plan'). */
export function obj(config: OpencodeConfig, ...path: string[]): Record<string, unknown> {
  let cur: unknown = config
  for (const key of path) cur = (cur as Record<string, unknown> | undefined)?.[key]
  return typeof cur === 'object' && cur !== null && !Array.isArray(cur) ? (cur as Record<string, unknown>) : {}
}

/** Gets (creating as needed) a nested object in the config layer for mutation. */
export function ensure(config: OpencodeConfig, ...path: string[]): Record<string, unknown> {
  let cur = config as Record<string, unknown>
  for (const key of path) {
    const next = cur[key]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) cur[key] = {}
    cur = cur[key] as Record<string, unknown>
  }
  return cur
}

/** Deletes empty objects left behind after removing keys, so the layer stays tidy. */
export function prune(config: OpencodeConfig, ...path: string[]): void {
  for (let i = path.length; i > 0; i--) {
    const parent = i === 1 ? config : obj(config, ...path.slice(0, i - 1))
    const key = path[i - 1]
    const value = parent[key]
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0) delete parent[key]
  }
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** Value at a dotted path in the config layer, e.g. getPath(cfg, ['compaction', 'reserved']). */
export function getPath(config: OpencodeConfig, path: string[]): unknown {
  return path.reduce<unknown>((cur, key) => (cur as Record<string, unknown> | undefined)?.[key], config)
}

/** Sets (or, for undefined/'', deletes) a value at a path, creating and pruning parent objects. */
export function setPath(config: OpencodeConfig, path: string[], value: unknown): void {
  const parent = ensure(config, ...path.slice(0, -1))
  const key = path[path.length - 1]
  if (value === undefined || value === '') delete parent[key]
  else parent[key] = value
  prune(config, ...path.slice(0, -1))
}

/**
 * A local draft of the opencode config layer for forms with many fields: edit freely,
 * then save once (one engine restart instead of one per field).
 */
export function useDraftLayer(): {
  draft: OpencodeConfig
  get: (path: string[]) => unknown
  set: (path: string[], value: unknown) => void
  dirty: boolean
  save: () => Promise<SaveResult>
  reset: () => void
} {
  const { settings, save } = useSettings()
  const [draft, setDraft] = useState<OpencodeConfig>(() => structuredClone(settings.opencode))
  return {
    draft,
    get: (path) => getPath(draft, path),
    set: (path, value) =>
      setDraft((d) => {
        const copy = structuredClone(d)
        setPath(copy, path, value)
        return copy
      }),
    dirty: JSON.stringify(draft) !== JSON.stringify(settings.opencode),
    save: async () => {
      const res = await save({ opencode: draft })
      if (res.ok) setDraft(structuredClone(res.settings.opencode))
      return res
    },
    reset: () => setDraft(structuredClone(settings.opencode))
  }
}
