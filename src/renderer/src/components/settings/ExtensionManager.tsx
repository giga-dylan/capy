import { useCallback, useEffect, useState } from 'react'
import type { ExtensionFile, ExtensionKind } from '@shared/types'
import { PlusIcon, TrashIcon } from '../icons'
import { useSettings } from './context'
import { btn, CodeEditor, errorText, inputCls, list } from './ui'

interface Props {
  kind: ExtensionKind
  /** Singular noun for buttons, e.g. "agent". */
  noun: string
  /** Placeholder for the name field, e.g. "code-review". */
  namePlaceholder: string
  /** Starter content for a new file. */
  template: (name: string) => string
  /** How the name maps to a file, shown under the name field. */
  fileHint: (name: string) => string
}

/** List + editor for the app's own extension files (agents/*.md, skills/<name>/SKILL.md, plugins/*.ts, ...). */
export function ExtensionManager({ kind, noun, namePlaceholder, template, fileHint }: Props): React.JSX.Element {
  const { refreshInventory } = useSettings()
  const [files, setFiles] = useState<ExtensionFile[]>([])
  // `null` = list view; otherwise the file being edited (isNew: name still editable).
  const [editing, setEditing] = useState<{ name: string; content: string; isNew: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(() => void window.api.listExtensions(kind).then(setFiles), [kind])
  useEffect(load, [load])

  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      load()
      refreshInventory()
      return true
    } catch (err) {
      setError(errorText(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    const original = files.find((f) => f.name === editing.name && !editing.isNew)
    const dirty = editing.isNew || original?.content !== editing.content
    return (
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <label className="flex-1 space-y-1">
            <span className="block text-xs text-neutral-500">Name</span>
            <input
              value={editing.name}
              disabled={!editing.isNew}
              onChange={(e) => setEditing({ ...editing, name: e.target.value.trim() })}
              placeholder={namePlaceholder}
              className={`${inputCls} w-full font-mono text-xs disabled:opacity-60`}
            />
          </label>
        </div>
        {editing.name && <p className="font-mono text-[11px] text-neutral-500">{fileHint(editing.name)}</p>}
        <CodeEditor value={editing.content} onChange={(content) => setEditing({ ...editing, content })} rows={20} />
        {error && <p className="selectable text-xs text-red-500">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            disabled={busy || !editing.name || !dirty}
            onClick={async () => {
              if (await run(() => window.api.saveExtension(kind, editing.name, editing.content))) setEditing({ ...editing, isNew: false })
            }}
            className={btn.primary}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button disabled={busy} onClick={() => setEditing(null)} className={btn.ghost}>
            {dirty ? 'Cancel' : 'Back'}
          </button>
          <span className="flex-1" />
          {original && (
            <button onClick={() => window.api.revealPath(original.path)} className={btn.ghost}>
              Show in Finder
            </button>
          )}
          {original &&
            (confirmDelete ? (
              <button
                disabled={busy}
                onClick={async () => {
                  if (await run(() => window.api.deleteExtension(kind, editing.name))) {
                    setEditing(null)
                    setConfirmDelete(false)
                  }
                }}
                className={btn.danger}
              >
                Confirm delete
              </button>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className={btn.ghost}>
                <TrashIcon className="size-3.5" /> Delete
              </button>
            ))}
        </div>
        <p className="text-[11px] text-neutral-500">Saving restarts the agent engine so the change takes effect.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className={list}>
          {files.map((f) => (
            <li key={f.name}>
              <button
                onClick={() => setEditing({ name: f.name, content: f.content, isNew: false })}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span className="font-mono text-xs">{f.name}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{describe(f.content)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => setEditing({ name: '', content: template(namePlaceholder), isNew: true })} className={btn.secondary}>
        <PlusIcon className="size-3.5" /> New {noun}
      </button>
    </div>
  )
}

/** The frontmatter description, or the first comment line, for list previews. */
function describe(content: string): string {
  const fm = /^---\n[\s\S]*?^description:\s*(.+)$/m.exec(content)
  if (fm) return fm[1].replace(/^["']|["']$/g, '')
  const comment = /^\s*(?:\/\/|\*|\/\*\*)\s*(.+)$/m.exec(content)
  return comment?.[1] ?? ''
}
