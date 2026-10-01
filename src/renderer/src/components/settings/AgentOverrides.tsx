import { useState } from 'react'
import type { SaveResult } from '@shared/types'
import { useInstalledModels } from '../../models'
import { levelLabel, levelName } from '../EffortPicker'
import { obj, setPath, useSettings } from './context'
import { btn, card, CodeEditor, inputCls, NumberInput, SaveMessage } from './ui'

const PROVIDER = 'ollama'

/**
 * Per-agent overrides in opencode's `agent.<name>` config: model, reasoning effort, sampling,
 * step limit, prompt and permissions. Works for built-in and custom agents alike.
 */
export function AgentOverrides({ name, native, onClose }: { name: string; native?: boolean; onClose: () => void }): React.JSX.Element {
  const { settings, updateOpencode } = useSettings()
  const models = useInstalledModels()
  const [draft, setDraft] = useState<Record<string, unknown>>(() => structuredClone(obj(settings.opencode, 'agent', name)))
  const [permissionText, setPermissionText] = useState(() => (draft.permission ? JSON.stringify(draft.permission, null, 2) : ''))
  const [result, setResult] = useState<SaveResult>()

  const set = (key: string, value: unknown): void => {
    const next = { ...draft }
    if (value === undefined || value === '') delete next[key]
    else next[key] = value
    setDraft(next)
  }

  const modelName = typeof draft.model === 'string' ? draft.model.replace(`${PROVIDER}/`, '') : ''
  const levels = (models.find((m) => m.name === modelName)?.thinking?.values ?? []).map(levelName)

  let permissionError: string | undefined
  let permission: unknown
  if (permissionText.trim()) {
    try {
      permission = JSON.parse(permissionText)
    } catch (err) {
      permissionError = (err as Error).message
    }
  }

  async function save(): Promise<void> {
    const value = { ...draft, ...(permission !== undefined ? { permission } : {}) }
    if (!permissionText.trim()) delete value.permission
    setResult(await updateOpencode((config) => setPath(config, ['agent', name], Object.keys(value).length ? value : undefined)))
  }

  return (
    <div className={`${card} mt-2 space-y-3 bg-neutral-50 p-3 dark:bg-neutral-900/50`}>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="block text-xs text-neutral-500">Model</span>
          <select
            value={modelName}
            onChange={(e) => {
              const next = { ...draft }
              if (e.target.value) next.model = `${PROVIDER}/${e.target.value}`
              else delete next.model
              delete next.variant // levels differ per model
              setDraft(next)
            }}
            className={`${inputCls} w-full`}
          >
            <option value="">Chat’s model (default)</option>
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-neutral-500">Thinking</span>
          <select
            value={(draft.variant as string) ?? ''}
            disabled={!levels.length}
            onChange={(e) => set('variant', e.target.value || undefined)}
            className={`${inputCls} w-full disabled:opacity-40`}
          >
            <option value="">{modelName ? 'Model default' : 'Pick a model first'}</option>
            {levels.map((l) => (
              <option key={l} value={l}>
                {levelLabel(l)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-neutral-500">Temperature (0–1)</span>
          <NumberInput value={draft.temperature} onChange={(v) => set('temperature', v)} step={0.1} min={0} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-neutral-500">Top P (0–1)</span>
          <NumberInput value={draft.top_p} onChange={(v) => set('top_p', v)} step={0.05} min={0} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-neutral-500">Max steps per task</span>
          <NumberInput value={draft.steps} onChange={(v) => set('steps', v)} min={1} placeholder="no limit" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-neutral-500">Description</span>
          <input value={(draft.description as string) ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="default" className={`${inputCls} w-full`} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="block text-xs text-neutral-500">
          System prompt {native && <span className="text-amber-500">(replaces this built-in agent’s prompt)</span>}
        </span>
        <CodeEditor value={(draft.prompt as string) ?? ''} onChange={(v) => set('prompt', v)} rows={5} placeholder="default" />
      </label>
      <label className="block space-y-1">
        <span className="block text-xs text-neutral-500">Permissions for this agent (JSON, same format as the Permissions tab)</span>
        <CodeEditor value={permissionText} onChange={setPermissionText} rows={4} placeholder={'{ "edit": "deny", "bash": { "git *": "allow", "*": "ask" } }'} />
        {permissionError && <span className="text-xs text-red-500">{permissionError}</span>}
      </label>
      <div className="flex items-center gap-2">
        <button disabled={!!permissionError} onClick={save} className={btn.primary}>
          Save
        </button>
        <button onClick={onClose} className={btn.ghost}>
          Close
        </button>
        <SaveMessage result={result} />
      </div>
    </div>
  )
}
