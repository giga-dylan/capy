import { useState } from 'react'
import type { PermissionLevel, SaveResult } from '@shared/types'
import { PlusIcon, XIcon } from '../icons'

export const inputCls =
  'rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900'
const btnBase = 'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40'
export const btn = {
  primary: `${btnBase} bg-blue-600 text-white hover:bg-blue-500`,
  secondary: `${btnBase} border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800`,
  ghost: `${btnBase} text-neutral-500 hover:text-neutral-900 dark:hover:text-white`,
  danger: `${btnBase} bg-red-600 text-white hover:bg-red-500`
}
export const card = 'rounded-lg border border-neutral-200 dark:border-neutral-800'
export const list = `divide-y divide-neutral-200 dark:divide-neutral-800 ${card}`

export function Section({
  title,
  description,
  actions,
  children
}: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section>
      <div className="mb-3 flex items-end gap-3">
        <div className="flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red' }): React.JSX.Element {
  const tones = {
    neutral: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
    blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    red: 'bg-red-500/15 text-red-600 dark:text-red-400'
  }
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-blue-600' : 'bg-neutral-300 dark:bg-neutral-700'}`}
    >
      <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

export function LevelSelect({
  value,
  onChange,
  allowDefault
}: {
  value: PermissionLevel | undefined
  onChange: (v: PermissionLevel | undefined) => void
  allowDefault?: boolean
}): React.JSX.Element {
  return (
    <select value={value ?? ''} onChange={(e) => onChange((e.target.value || undefined) as PermissionLevel | undefined)} className={inputCls}>
      {allowDefault && <option value="">Default</option>}
      <option value="ask">Ask</option>
      <option value="allow">Allow</option>
      <option value="deny">Deny</option>
    </select>
  )
}

export function CodeEditor({
  value,
  onChange,
  rows = 16,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}): React.JSX.Element {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // Tab inserts two spaces instead of moving focus.
        if (e.key !== 'Tab') return
        e.preventDefault()
        const t = e.currentTarget
        const { selectionStart: a, selectionEnd: b } = t
        onChange(value.slice(0, a) + '  ' + value.slice(b))
        requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2))
      }}
      spellCheck={false}
      rows={rows}
      placeholder={placeholder}
      className={`${inputCls} selectable block w-full font-mono text-xs leading-relaxed`}
    />
  )
}

/** Editable list of strings (paths, URLs, package names). Calls onSave with the whole list. */
export function StringList({
  items,
  placeholder,
  onSave,
  empty
}: {
  items: string[]
  placeholder: string
  onSave: (items: string[]) => Promise<unknown>
  empty?: string
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  return (
    <div className="space-y-2">
      {items.length > 0 ? (
        <ul className={list}>
          {items.map((item) => (
            <li key={item} className="flex items-center gap-2 px-3 py-2">
              <code className="selectable min-w-0 flex-1 truncate font-mono text-xs">{item}</code>
              <button onClick={() => onSave(items.filter((i) => i !== item))} title="Remove" className="rounded p-0.5 text-neutral-500 hover:text-red-500">
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        empty && <p className="text-xs text-neutral-500">{empty}</p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const value = draft.trim()
          if (value && !items.includes(value)) onSave([...items, value]).then(() => setDraft(''))
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} className={`${inputCls} min-w-0 flex-1 font-mono text-xs`} />
        <button disabled={!draft.trim()} className={btn.secondary}>
          <PlusIcon className="size-3.5" /> Add
        </button>
      </form>
    </div>
  )
}

/** Shows the result of the last save (errors stay until the next action). */
export function SaveMessage({ result }: { result?: SaveResult | { ok: true } | { ok: false; error: string } }): React.JSX.Element | null {
  if (!result) return null
  return result.ok ? (
    <p className="text-xs text-emerald-500">Saved. The agent engine restarted with your changes.</p>
  ) : (
    <p className="selectable text-xs text-red-500">{result.error}</p>
  )
}

export function errorText(err: unknown): string {
  return String(err).replace(/^Error: (Error invoking remote method '[^']+': )?(Error: )?/, '')
}

/** Labeled field row: label + hint on the left, control on the right. */
export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center gap-4 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

/** Number input where empty means "unset" (use opencode's default). */
export function NumberInput({
  value,
  onChange,
  placeholder = 'default',
  step,
  min
}: {
  value: unknown
  onChange: (v: number | undefined) => void
  placeholder?: string
  step?: number
  min?: number
}): React.JSX.Element {
  return (
    <input
      type="number"
      value={typeof value === 'number' ? value : ''}
      placeholder={placeholder}
      step={step}
      min={min}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      className={`${inputCls} w-28 text-right`}
    />
  )
}

/** Text input where empty means "unset". */
export function TextInput({ value, onChange, placeholder, mono }: { value: unknown; onChange: (v: string | undefined) => void; placeholder?: string; mono?: boolean }): React.JSX.Element {
  return (
    <input
      value={typeof value === 'string' ? value : ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={`${inputCls} w-64 ${mono ? 'font-mono text-xs' : ''}`}
    />
  )
}

/** Tri-state for optional booleans: default (unset) / on / off. */
export function BoolSelect({ value, onChange, defaultLabel }: { value: unknown; onChange: (v: boolean | undefined) => void; defaultLabel: string }): React.JSX.Element {
  return (
    <select
      value={value === true ? 'on' : value === false ? 'off' : ''}
      onChange={(e) => onChange(e.target.value === 'on' ? true : e.target.value === 'off' ? false : undefined)}
      className={inputCls}
    >
      <option value="">Default ({defaultLabel})</option>
      <option value="on">On</option>
      <option value="off">Off</option>
    </select>
  )
}

/** Sticky footer for draft forms. */
export function SaveBar({ dirty, onSave, onReset, result }: { dirty: boolean; onSave: () => Promise<SaveResult>; onReset: () => void; result?: SaveResult }): React.JSX.Element | null {
  const [saving, setSaving] = useState(false)
  const [last, setLast] = useState<SaveResult | undefined>(result)
  if (!dirty && !last) return null
  return (
    <div className="sticky bottom-0 -mx-6 mt-6 flex items-center gap-3 border-t border-neutral-200 bg-white/95 px-6 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
      <div className="flex-1">{dirty ? <p className="text-xs text-neutral-500">Unsaved changes. Saving restarts the agent engine.</p> : <SaveMessage result={last} />}</div>
      {dirty && (
        <>
          <button disabled={saving} onClick={onReset} className={btn.ghost}>
            Discard
          </button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              setLast(await onSave())
              setSaving(false)
            }}
            className={btn.primary}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    </div>
  )
}
