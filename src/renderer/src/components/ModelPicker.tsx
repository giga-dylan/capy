import { useState } from 'react'
import { formatBytes, supportsTools, useInstalledModels } from '../models'
import { BrainIcon, CheckIcon, ChevronDownIcon, SettingsIcon } from './icons'

/** Composer dropdown for switching the active model. Applies to the next message. */
export function ModelPicker({ model, onOpenSettings }: { model: string; onOpenSettings: () => void }): React.JSX.Element {
  const models = useInstalledModels()
  const [open, setOpen] = useState(false)

  async function select(name: string): Promise<void> {
    setOpen(false)
    if (name !== model) await window.api.saveSettings({ model: name })
  }

  return (
    <div className="relative min-w-0 shrink">
      <button
        onClick={() => setOpen(!open)}
        title={`Model: ${model}`}
        className="flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
      >
        <BrainIcon className="size-3.5 shrink-0" />
        <span className="hidden min-w-0 truncate font-mono whitespace-nowrap @2xl:inline">{model}</span>
        <ChevronDownIcon className="size-3 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full z-20 mb-2 w-80 rounded-lg border border-neutral-200 bg-white p-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            {models.map((m) => (
              <button
                key={m.name}
                onClick={() => select(m.name)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs">{m.name}</span>
                  <span className="block text-xs text-neutral-500">
                    {formatBytes(m.size)}
                    {!supportsTools(m) && <span className="text-amber-500"> · no tool support</span>}
                  </span>
                </span>
                {m.name === model && <CheckIcon className="size-3.5 text-blue-500" />}
              </button>
            ))}
            <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
            <button
              onClick={() => {
                setOpen(false)
                onOpenSettings()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <SettingsIcon className="size-3.5" /> Manage models…
            </button>
          </div>
        </>
      )}
    </div>
  )
}
