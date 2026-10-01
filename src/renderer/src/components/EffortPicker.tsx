import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { useInstalledModels } from '../models'
import { CheckIcon, ChevronDownIcon, GaugeIcon } from './icons'

/** Ollama's levels as opencode variant names (see effortVariants in src/main/opencode.ts). */
export const levelName = (v: string | boolean): string => (v === false ? 'off' : v === true ? 'on' : v)

/** Display names for Ollama level ids; others are shown capitalized as-is. */
const LABELS: Record<string, string> = { off: 'Off', on: 'On', xhigh: 'Extra high', max: 'Max' }
export const levelLabel = (level: string): string => LABELS[level] ?? level.charAt(0).toUpperCase() + level.slice(1)

/** Composer dropdown for the active model's reasoning effort. Hidden for models without levels. */
export function EffortPicker({ model }: { model: string }): React.JSX.Element | null {
  const models = useInstalledModels()
  const [settings, setSettings] = useState<AppSettings>()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const load = (): void => void window.api.getSettings().then(setSettings)
    load()
    return window.api.onStatus(load)
  }, [])

  const active = models.find((m) => m.name === model)
  const thinking = active?.thinking
  const levels = (thinking?.values ?? []).map(levelName)
  if (!settings || !active?.capabilities.includes('thinking')) return null
  // Thinking models that report no levels (e.g. deepseek-r1) always think and ignore the setting.
  if (!levels.length) {
    return (
      <span title="Thinking: always on. This model doesn't support changing reasoning effort." className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-500">
        <GaugeIcon className="size-3.5 shrink-0" />
        <span className="hidden whitespace-nowrap @xl:inline">always on</span>
      </span>
    )
  }

  const defaultLevel = thinking?.default !== undefined ? levelName(thinking.default) : undefined
  const chosen = settings.reasoningEffort[model]
  const current = chosen && levels.includes(chosen) ? chosen : undefined

  async function select(level: string | undefined): Promise<void> {
    setOpen(false)
    const efforts = { ...settings!.reasoningEffort }
    if (level) efforts[model] = level
    else delete efforts[model]
    const res = await window.api.saveSettings({ reasoningEffort: efforts })
    if (res.ok) setSettings(res.settings)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title={`Reasoning effort: ${levelLabel(current ?? defaultLevel ?? 'default').toLowerCase()}`}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
      >
        <GaugeIcon className="size-3.5 shrink-0" />
        <span className="hidden whitespace-nowrap @xl:inline">{levelLabel(current ?? defaultLevel ?? 'default').toLowerCase()}</span>
        <ChevronDownIcon className="size-3 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full z-20 mb-2 w-56 rounded-lg border border-neutral-200 bg-white p-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <p className="px-2 pt-1 pb-1.5 text-xs text-neutral-500">Reasoning effort · more thinking is slower but smarter</p>
            {levels.map((level) => (
              <button
                key={level}
                onClick={() => select(level === defaultLevel ? undefined : level)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                {levelLabel(level)}
                {level === defaultLevel && <span className="text-xs text-neutral-500">(model default)</span>}
                <span className="flex-1" />
                {(current ?? defaultLevel) === level && <CheckIcon className="size-3.5 text-blue-500" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
