import { useState } from 'react'
import type { InstalledModel, ModelProgress } from '@shared/types'
import { formatBytes, progressPercent, RECOMMENDED_MODELS, supportsTools, useInstalledModels, useModelProgress } from '../models'
import { levelLabel, levelName } from './EffortPicker'
import { CheckIcon, DownloadIcon, FolderIcon, TrashIcon } from './icons'

const btn = 'rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40'
const primary = `${btn} bg-blue-600 text-white hover:bg-blue-500`
const secondary = `${btn} border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800`

/** Installed models plus ways to add more: recommended list, any Ollama tag, or local import. */
export function ModelLibrary({ activeModel }: { activeModel?: string }): React.JSX.Element {
  const installed = useInstalledModels()
  const progress = useModelProgress()
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string>()

  const busy = (name: string): boolean => !!progress[name] && !progress[name].done
  const installedNames = new Set(installed.map((m) => m.name))

  async function run(action: () => Promise<unknown>): Promise<void> {
    setError(undefined)
    try {
      await action()
    } catch (err) {
      setError(String(err).replace(/^Error: (Error invoking remote method '[^']+': )?(Error: )?/, ''))
    }
  }

  // Imports/downloads in flight whose names aren't in the recommended list.
  const otherTasks = Object.values(progress).filter((p) => !p.done && !RECOMMENDED_MODELS.some((r) => r.name === p.model))

  return (
    <div className="space-y-6">
      {installed.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Installed</h3>
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {installed.map((m) => (
              <InstalledRow key={m.name} model={m} active={m.name === activeModel} run={run} />
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">Recommended</h3>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {RECOMMENDED_MODELS.map((r) => (
            <li key={r.name} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {r.label} <span className="text-xs text-neutral-500">· {r.size}</span>
                </p>
                <p className="text-xs text-neutral-500">{r.note}</p>
                <ProgressLine progress={progress[r.name]} />
              </div>
              {installedNames.has(r.name) || installedNames.has(`${r.name}:latest`) ? (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <CheckIcon className="size-3.5" /> Installed
                </span>
              ) : (
                <button disabled={busy(r.name)} onClick={() => run(() => window.api.pullModel(r.name))} className={secondary}>
                  <span className="flex items-center gap-1">
                    <DownloadIcon className="size-3.5" /> {busy(r.name) ? 'Downloading…' : 'Download'}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <h3 className="text-sm font-medium">Any Ollama model</h3>
          <p className="mb-2 text-xs text-neutral-500">
            Enter a tag from{' '}
            <a href="https://ollama.com/library" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
              ollama.com/library
            </a>
            , e.g. <code className="font-mono">qwen3.8:27b-q8_0</code>
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const name = custom.trim()
              if (name) run(() => window.api.pullModel(name)).then(() => setCustom(''))
            }}
          >
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="model:tag"
              className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-2 py-1 font-mono text-xs outline-none focus:border-blue-500 dark:border-neutral-700"
            />
            <button disabled={!custom.trim() || busy(custom.trim())} className={primary}>
              Download
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <h3 className="text-sm font-medium">Import from disk</h3>
          <p className="mb-2 text-xs text-neutral-500">
            An MLX/safetensors folder (e.g. from LM Studio) or a <code className="font-mono">.gguf</code> file. Ollama copies it into its model
            folder.
          </p>
          <button onClick={() => run(() => window.api.importModel())} className={secondary}>
            <span className="flex items-center gap-1">
              <FolderIcon className="size-3.5" /> Choose…
            </span>
          </button>
        </div>
      </div>

      {otherTasks.map((p) => (
        <div key={p.model} className="text-xs">
          <span className="font-mono">{p.model}</span>
          <ProgressLine progress={p} />
        </div>
      ))}
      {Object.values(progress)
        .filter((p) => p.error)
        .map((p) => (
          <p key={p.model} className="selectable text-xs text-red-500">
            {p.model}: {p.error}
          </p>
        ))}
      {error && <p className="selectable text-xs text-red-500">{error}</p>}
    </div>
  )
}

function InstalledRow({
  model,
  active,
  run
}: {
  model: InstalledModel
  active: boolean
  run: (action: () => Promise<unknown>) => Promise<void>
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs">{model.name}</p>
        <p className="text-xs text-neutral-500">
          {formatBytes(model.size)} · {model.quantization} · {model.capabilities.filter((c) => c !== 'completion').join(', ') || 'text only'}
          {!supportsTools(model) && <span className="text-amber-500"> · no tool support (can't run agent tools)</span>}
        </p>
        {model.capabilities.includes('thinking') && (
          <p className="text-xs text-neutral-500">
            {model.thinking
              ? `Thinking: ${model.thinking.values.map((v) => levelLabel(levelName(v))).join(', ')}${model.thinking.default !== undefined ? ` (default ${levelLabel(levelName(model.thinking.default)).toLowerCase()})` : ''}`
              : 'Thinking: always on (not adjustable)'}
          </p>
        )}
      </div>
      {active ? (
        <span className="text-xs text-blue-500">Active</span>
      ) : (
        <button onClick={() => run(() => window.api.saveSettings({ model: model.name }))} className={secondary}>
          Use
        </button>
      )}
      {confirming ? (
        <>
          <button onClick={() => run(() => window.api.deleteModel(model.name))} className={`${btn} bg-red-600 text-white hover:bg-red-500`}>
            Delete {formatBytes(model.size)}
          </button>
          <button onClick={() => setConfirming(false)} className={secondary}>
            Cancel
          </button>
        </>
      ) : (
        <button onClick={() => setConfirming(true)} title="Delete model" className="rounded p-1 text-neutral-500 hover:text-red-500">
          <TrashIcon />
        </button>
      )}
    </li>
  )
}

function ProgressLine({ progress }: { progress?: ModelProgress }): React.JSX.Element | null {
  if (!progress || progress.done) return null
  const pct = progressPercent(progress)
  return (
    <div className="mt-1.5 space-y-1">
      {pct !== undefined && (
        <div className="h-1.5 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="truncate text-xs text-neutral-500">
        {progress.status}
        {progress.total ? ` — ${formatBytes(progress.completed ?? 0)} / ${formatBytes(progress.total)}` : ''}
      </p>
    </div>
  )
}
