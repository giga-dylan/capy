import { useState } from 'react'
import type { AccessMode, PermissionLevel, SaveResult } from '@shared/types'
import { ACCESS_MODES } from '../AccessPicker'
import { PlusIcon, XIcon } from '../icons'
import { obj, prune, useSettings } from './context'
import { btn, inputCls, LevelSelect, list, SaveMessage, Section } from './ui'

/** opencode's permission keys (opencode.ai/docs/permissions). `patterns` = supports per-pattern rules. */
const PERMISSIONS: { key: string; label: string; hint: string; patterns?: string }[] = [
  { key: 'read', label: 'Read files', hint: 'Open file contents', patterns: 'file path glob, e.g. *.env' },
  { key: 'edit', label: 'Edit files', hint: 'Create, modify or delete files', patterns: 'file path glob, e.g. src/**' },
  { key: 'bash', label: 'Run shell commands', hint: 'Any terminal command', patterns: 'command glob, e.g. git *' },
  { key: 'external_directory', label: 'Outside the project', hint: 'Touch files outside the chat’s folder', patterns: 'path glob' },
  { key: 'webfetch', label: 'Fetch web pages', hint: 'Download content from a URL' },
  { key: 'websearch', label: 'Search the web', hint: 'Run web searches' },
  { key: 'task', label: 'Launch subagents', hint: 'Hand work to another agent', patterns: 'agent name, e.g. explore' },
  { key: 'skill', label: 'Use skills', hint: 'Load a skill’s instructions', patterns: 'skill name glob' },
  { key: 'glob', label: 'Find files', hint: 'Search file names', patterns: 'pattern' },
  { key: 'grep', label: 'Search code', hint: 'Search file contents', patterns: 'pattern' },
  { key: 'list', label: 'List folders', hint: 'Read folder contents', patterns: 'path glob' },
  { key: 'lsp', label: 'Code intelligence', hint: 'Language-server lookups', patterns: 'pattern' },
  { key: 'todowrite', label: 'Update its to-do list', hint: 'Track multi-step work' },
  { key: 'question', label: 'Ask you questions', hint: 'Pause to ask for input' },
  { key: 'doom_loop', label: 'Repeat a failing call', hint: 'Same tool call 3× in a row' }
]

type Rule = [pattern: string, level: PermissionLevel]
interface Entry {
  level?: PermissionLevel
  rules: Rule[]
}

/** opencode stores a key as "allow" or as { "<pattern>": level, "*": default }. */
function toEntry(value: unknown): Entry {
  if (typeof value === 'string') return { level: value as PermissionLevel, rules: [] }
  const map = (value ?? {}) as Record<string, PermissionLevel>
  return { level: map['*'], rules: Object.entries(map).filter(([p]) => p !== '*') }
}

function fromEntry({ level, rules }: Entry): unknown {
  const valid = rules.filter(([p]) => p.trim())
  if (!valid.length) return level
  return { ...Object.fromEntries(valid), ...(level && { '*': level }) }
}

/** The chat box's access mode, also selectable here. Auto/Full override the rules below. */
function AccessModeSection(): React.JSX.Element {
  const { settings, refreshInventory } = useSettings()
  const [mode, setMode] = useState<AccessMode>(settings.accessMode)
  return (
    <Section title="Access mode" description="Also in the chat box. Auto-approve and Full access override the rules below for the chats they apply to.">
      <div className="grid grid-cols-3 gap-2">
        {ACCESS_MODES.map((m) => (
          <button
            key={m.mode}
            onClick={async () => {
              setMode(m.mode)
              await window.api.setAccessMode(m.mode)
              refreshInventory()
            }}
            className={`rounded-lg border p-3 text-left ${mode === m.mode ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900'}`}
          >
            <p className={`text-sm font-medium ${m.mode === 'full' ? 'text-amber-500' : ''}`}>{m.label}</p>
            <p className="mt-1 text-xs text-neutral-500">{m.description}</p>
          </button>
        ))}
      </div>
    </Section>
  )
}

export function PermissionsSection(): React.JSX.Element {
  return (
    <div className="space-y-10">
      <AccessModeSection />
      <PermissionRules />
    </div>
  )
}

function PermissionRules(): React.JSX.Element {
  const { settings, updateOpencode } = useSettings()
  const saved = obj(settings.opencode, 'permission')
  const [draft, setDraft] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(PERMISSIONS.map(({ key }) => [key, toEntry(saved[key])]))
  )
  const [result, setResult] = useState<SaveResult>()
  const [saving, setSaving] = useState(false)

  const encoded = Object.fromEntries(PERMISSIONS.map(({ key }) => [key, fromEntry(draft[key])]).filter(([, v]) => v !== undefined))
  const dirty = PERMISSIONS.some(({ key }) => JSON.stringify(encoded[key]) !== JSON.stringify(saved[key]))
  const set = (key: string, entry: Entry): void => setDraft({ ...draft, [key]: entry })

  async function save(): Promise<void> {
    setSaving(true)
    setResult(
      await updateOpencode((config) => {
        const perm = { ...obj(config, 'permission') }
        for (const { key } of PERMISSIONS) {
          if (encoded[key] === undefined) delete perm[key]
          else perm[key] = encoded[key]
        }
        config.permission = perm
        prune(config, 'permission')
      })
    )
    setSaving(false)
  }

  return (
    <Section
      title="Permission rules"
      description={
        <>
          What the agent may do without asking in <b>Ask first</b> mode. <b>Ask</b> shows an approval card in the chat. <b>Default</b> uses opencode’s default. Rules match in
          order; the most specific wins.
        </>
      }
      actions={
        dirty && (
          <button disabled={saving} onClick={save} className={btn.primary}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )
      }
    >
      <ul className={list}>
        {PERMISSIONS.map(({ key, label, hint, patterns }) => {
          const entry = draft[key]
          return (
            <li key={key} className="space-y-2 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {label} <code className="font-mono text-[11px] text-neutral-500">{key}</code>
                  </p>
                  <p className="text-xs text-neutral-500">{hint}</p>
                </div>
                {patterns && (
                  <button onClick={() => set(key, { ...entry, rules: [...entry.rules, ['', 'ask']] })} className={btn.ghost} title={`Add a rule (${patterns})`}>
                    <PlusIcon className="size-3.5" /> Rule
                  </button>
                )}
                <LevelSelect value={entry.level} allowDefault onChange={(level) => set(key, { ...entry, level })} />
              </div>
              {entry.rules.map(([pattern, level], i) => (
                <div key={i} className="ml-4 flex items-center gap-2">
                  <input
                    value={pattern}
                    placeholder={patterns}
                    onChange={(e) => set(key, { ...entry, rules: entry.rules.map((r, j) => (j === i ? [e.target.value, r[1]] : r)) })}
                    className={`${inputCls} min-w-0 flex-1 font-mono text-xs`}
                  />
                  <LevelSelect value={level} onChange={(l) => set(key, { ...entry, rules: entry.rules.map((r, j) => (j === i ? [r[0], l ?? 'ask'] : r)) })} />
                  <button onClick={() => set(key, { ...entry, rules: entry.rules.filter((_, j) => j !== i) })} className="rounded p-0.5 text-neutral-500 hover:text-red-500">
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}
            </li>
          )
        })}
      </ul>
      <div className="mt-2">
        <SaveMessage result={result} />
      </div>
    </Section>
  )
}
