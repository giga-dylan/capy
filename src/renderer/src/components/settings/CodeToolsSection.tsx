import { useState } from 'react'
import type { OpencodeConfig, SaveResult } from '@shared/types'
import { PlusIcon, TrashIcon } from '../icons'
import { useSettings } from './context'
import { Badge, btn, card, inputCls, list, SaveMessage, Section, Toggle } from './ui'

type Kind = 'formatter' | 'lsp'
interface Custom {
  command?: string[]
  extensions?: string[]
  disabled?: boolean
}

/**
 * opencode's `formatter` / `lsp` keys are `true` (all built-ins on), an object of per-tool settings
 * (which also turns the feature on), or unset/false (off). Tested on opencode 1.18: unset = off.
 */
function readKind(config: OpencodeConfig, kind: Kind): { enabled: boolean; entries: Record<string, Custom> } {
  const value = config[kind]
  if (value === true) return { enabled: true, entries: {} }
  if (typeof value === 'object' && value !== null) return { enabled: true, entries: value as Record<string, Custom> }
  return { enabled: false, entries: {} }
}

function writeKind(config: OpencodeConfig, kind: Kind, enabled: boolean, entries: Record<string, Custom>): void {
  if (!enabled) delete config[kind]
  else config[kind] = Object.keys(entries).length ? entries : true
}

export function CodeToolsSection(): React.JSX.Element {
  return (
    <div className="space-y-10">
      <KindSection
        kind="formatter"
        title="Formatters"
        description="Run the project’s formatter (prettier, gofmt, ruff, …) on files the agent edits. A formatter only runs if the project has it installed or configured."
      />
      <KindSection
        kind="lsp"
        title="Language servers (LSP)"
        description="Give the agent compiler errors and code navigation after it edits files. Servers start per project, so their status shows up while you chat in a project folder."
      />
    </div>
  )
}

function KindSection({ kind, title, description }: { kind: Kind; title: string; description: string }): React.JSX.Element {
  const { settings, inventory, updateOpencode } = useSettings()
  const { enabled, entries } = readKind(settings.opencode, kind)
  const [result, setResult] = useState<SaveResult>()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', command: '', extensions: '' })

  const update = (mutate: (entries: Record<string, Custom>) => { enabled?: boolean } | void): Promise<void> =>
    updateOpencode((config) => {
      const current = readKind(config, kind)
      const next = structuredClone(current.entries)
      const res = mutate(next)
      writeKind(config, kind, res?.enabled ?? current.enabled, next)
    }).then(setResult)

  // Built-in formatters come from the live engine; LSP lists only servers running for a project.
  const builtIns: { name: string; detail: string; status?: string }[] =
    kind === 'formatter'
      ? (inventory?.formatters ?? []).map((f) => ({ name: f.name, detail: f.extensions.join(' '), status: f.enabled ? 'applies here' : undefined }))
      : (inventory?.lsp ?? []).map((l) => ({ name: l.name, detail: l.root, status: l.status }))
  const customs = Object.entries(entries).filter(([, e]) => e.command)
  const valid = /^[a-z0-9_-]+$/i.test(form.name) && form.command.trim() && form.extensions.trim()

  return (
    <Section
      title={title}
      description={description}
      actions={
        <div className="flex items-center gap-2 text-sm">
          {enabled ? 'On' : 'Off'}
          <Toggle checked={enabled} onChange={(on) => update(() => ({ enabled: on }))} />
        </div>
      }
    >
      {enabled && (
        <div className="space-y-3">
          {builtIns.length > 0 && (
            <ul className={list}>
              {builtIns.map((b) => (
                <li key={b.name} className="flex items-center gap-3 px-3 py-2">
                  <span className="font-mono text-xs">{b.name}</span>
                  {b.status && <Badge tone={b.status === 'error' ? 'red' : 'green'}>{b.status}</Badge>}
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-500">{b.detail}</span>
                  <Toggle
                    checked={!entries[b.name]?.disabled}
                    onChange={(on) =>
                      update((e) => {
                        if (on) delete e[b.name]
                        else e[b.name] = { disabled: true }
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {kind === 'lsp' && builtIns.length === 0 && (
            <p className="text-xs text-neutral-500">No language servers running yet. opencode starts them automatically when the agent works on matching files.</p>
          )}

          {Object.entries(entries)
            .filter(([name, e]) => e.disabled && !e.command && !builtIns.some((b) => b.name === name))
            .map(([name]) => (
              <p key={name} className="flex items-center gap-2 text-xs text-neutral-500">
                <span className="font-mono">{name}</span> is turned off.
                <button onClick={() => update((e) => void delete e[name])} className="text-blue-500 hover:underline">
                  Turn back on
                </button>
              </p>
            ))}

          {customs.length > 0 && (
            <ul className={list}>
              {customs.map(([name, e]) => (
                <li key={name} className="flex items-center gap-3 px-3 py-2">
                  <span className="font-mono text-xs">{name}</span>
                  <Badge tone="green">custom</Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-500">
                    {e.command?.join(' ')} · {e.extensions?.join(' ')}
                  </span>
                  <button onClick={() => update((all) => void delete all[name])} className="rounded p-1 text-neutral-500 hover:text-red-500">
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {adding ? (
            <div className={`${card} space-y-2 p-3`}>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="name" className={`${inputCls} w-full font-mono text-xs`} />
              <input
                value={form.command}
                onChange={(e) => setForm({ ...form, command: e.target.value })}
                placeholder={kind === 'formatter' ? 'command, $FILE = the edited file: npx prettier --write $FILE' : 'command: typescript-language-server --stdio'}
                className={`${inputCls} w-full font-mono text-xs`}
              />
              <input
                value={form.extensions}
                onChange={(e) => setForm({ ...form, extensions: e.target.value })}
                placeholder="file extensions: .ts .tsx"
                className={`${inputCls} w-full font-mono text-xs`}
              />
              <div className="flex gap-2">
                <button
                  disabled={!valid}
                  onClick={async () => {
                    await update((e) => {
                      e[form.name] = { command: form.command.trim().split(/\s+/), extensions: form.extensions.trim().split(/[\s,]+/) }
                    })
                    setAdding(false)
                    setForm({ name: '', command: '', extensions: '' })
                  }}
                  className={btn.primary}
                >
                  Add
                </button>
                <button onClick={() => setAdding(false)} className={btn.ghost}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className={btn.secondary}>
              <PlusIcon className="size-3.5" /> Custom {kind === 'formatter' ? 'formatter' : 'language server'}
            </button>
          )}
        </div>
      )}
      <div className="mt-2">
        <SaveMessage result={result} />
      </div>
    </Section>
  )
}
