import { useEffect, useState } from 'react'
import type { AccessMode } from '@shared/types'
import { CheckIcon, ChevronDownIcon, ShieldIcon } from './icons'

export const ACCESS_MODES: { mode: AccessMode; label: string; description: string }[] = [
  { mode: 'ask', label: 'Ask first', description: 'Follows your Permissions settings: asks before edits, commands and web access.' },
  {
    mode: 'auto',
    label: 'Auto-approve',
    description: 'Reads, edits and runs commands in the project without asking. Still asks before touching anything outside it or the web.'
  },
  { mode: 'full', label: 'Full access', description: 'Never asks. The agent can change any file and run any command on this Mac. Rules you set to Deny still block.' }
]

/**
 * Composer control for the access mode. The main process applies it to every chat at once,
 * including running tasks and pending approval cards.
 */
export function AccessPicker(): React.JSX.Element | null {
  const [mode, setMode] = useState<AccessMode>()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    window.api.getSettings().then((s) => setMode(s.accessMode))
  }, [])

  if (!mode) return null
  const current = ACCESS_MODES.find((m) => m.mode === mode)!

  async function select(next: AccessMode): Promise<void> {
    setOpen(false)
    setMode(next)
    await window.api.setAccessMode(next)
  }

  const tone = mode === 'full' ? 'text-amber-500' : mode === 'auto' ? 'text-blue-500' : 'text-neutral-500'
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title={`Access: ${current.label}`}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-neutral-200 dark:hover:bg-neutral-800 ${tone}`}
      >
        <ShieldIcon className="size-3.5 shrink-0" />
        <span className="hidden whitespace-nowrap @xl:inline">{current.label}</span>
        <ChevronDownIcon className="size-3 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-2 w-80 rounded-lg border border-neutral-200 bg-white p-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            {ACCESS_MODES.map((m) => (
              <button
                key={m.mode}
                onClick={() => select(m.mode)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span className="min-w-0 flex-1">
                  <span className={`block ${m.mode === 'full' ? 'text-amber-500' : ''}`}>{m.label}</span>
                  <span className="block text-xs text-neutral-500">{m.description}</span>
                </span>
                {m.mode === mode && <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-blue-500" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
