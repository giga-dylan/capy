import { useState } from 'react'
import type { SaveResult } from '@shared/types'
import { useInstalledModels } from '../../models'
import { ModelLibrary } from '../ModelLibrary'
import { useUpdateState } from '../UpdateBanner'
import { useSettings } from './context'
import { btn, inputCls, SaveMessage, Section } from './ui'

const CONTEXT_OPTIONS = [8192, 16384, 32768, 65536, 131072, 262144]

export function GeneralSection(): React.JSX.Element {
  const { settings, save, updateOpencode } = useSettings()
  const installed = useInstalledModels()
  const smallModel = typeof settings.opencode.small_model === 'string' ? settings.opencode.small_model.replace(/^ollama\//, '') : ''
  const [limits, setLimits] = useState({ contextLength: settings.contextLength, maxOutputTokens: settings.maxOutputTokens })
  const [result, setResult] = useState<SaveResult>()
  const [saving, setSaving] = useState(false)
  const limitsDirty = limits.contextLength !== settings.contextLength || limits.maxOutputTokens !== settings.maxOutputTokens

  async function apply(patch: Parameters<typeof save>[0]): Promise<void> {
    setSaving(true)
    setResult(await save(patch))
    setSaving(false)
  }

  return (
    <div className="space-y-10">
      <Section title="Models" description="The active model is used for new messages. You can also switch it from the chat box.">
        <ModelLibrary activeModel={settings.model} />
      </Section>

      <Section
        title="Model for titles & summaries"
        description="opencode uses a “small model” to name chats and summarize long ones. A smaller, faster model here keeps the main model free for real work."
      >
        <select
          value={smallModel}
          onChange={async (e) =>
            setResult(
              await updateOpencode((config) => {
                if (e.target.value) config.small_model = `ollama/${e.target.value}`
                else delete config.small_model
              })
            )
          }
          className={inputCls}
        >
          <option value="">Same as the active model</option>
          {installed.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Model storage" description="Where Ollama keeps downloaded models. Changing it restarts Ollama; models in the old folder won't show up.">
        <div className="flex items-center gap-2">
          <code className="selectable min-w-0 flex-1 truncate rounded-md bg-neutral-100 px-2 py-1.5 font-mono text-xs dark:bg-neutral-900">
            {settings.modelsDir ?? '~/.ollama/models (default, shared with Ollama)'}
          </code>
          <button
            disabled={saving}
            onClick={async () => {
              const dir = await window.api.chooseModelsDir()
              if (dir) apply({ modelsDir: dir })
            }}
            className={btn.secondary}
          >
            Change…
          </button>
          {settings.modelsDir && (
            <button disabled={saving} onClick={() => apply({ modelsDir: undefined })} className={btn.ghost}>
              Use default
            </button>
          )}
        </div>
      </Section>

      <Section title="Limits" description="A larger context lets the agent see more code, but uses more memory and makes each step slower.">
        <div className="flex flex-wrap items-end gap-6">
          <label className="space-y-1">
            <span className="block text-xs text-neutral-500">Context window</span>
            <select value={limits.contextLength} onChange={(e) => setLimits({ ...limits, contextLength: Number(e.target.value) })} className={inputCls}>
              {CONTEXT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n / 1024}K tokens
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-neutral-500">Max output per reply</span>
            <input
              type="number"
              min={256}
              step={256}
              value={limits.maxOutputTokens}
              onChange={(e) => setLimits({ ...limits, maxOutputTokens: Number(e.target.value) })}
              className={`${inputCls} w-32`}
            />
          </label>
          {limitsDirty && (
            <button disabled={saving} onClick={() => apply(limits)} className={btn.primary}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </Section>

      <About />

      <SaveMessage result={result} />
    </div>
  )
}

function About(): React.JSX.Element {
  const update = useUpdateState()
  if (!update) return <span />
  const status: Record<typeof update.status, string> = {
    dev: 'Development build: updates are off.',
    idle: '',
    checking: 'Checking for updates…',
    'up-to-date': 'You’re up to date.',
    available: `Capy ${update.latest} is available.`,
    downloading: `Downloading Capy ${update.latest ?? ''}… ${update.percent ?? 0}%`,
    ready: `Capy ${update.latest} is ready: restart to update.`,
    error: 'Couldn’t check for updates.'
  }
  return (
    <Section title="About" description="Updates come from Capy’s GitHub releases.">
      <div className="flex items-center gap-3">
        <span className="text-sm">Capy {update.version}</span>
        <span className="flex-1 text-xs text-neutral-500" title={update.error}>
          {status[update.status]}
          {update.status !== 'dev' && !update.canInstall && ' This copy isn’t signed by Apple, so updates download from GitHub instead of installing themselves.'}
        </span>
        {update.status === 'available' || update.status === 'ready' ? (
          <button onClick={() => window.api.installUpdate()} className={btn.primary}>
            {update.status === 'ready' ? 'Restart to update' : 'Download'}
          </button>
        ) : (
          <button disabled={update.status === 'dev' || update.status === 'checking'} onClick={() => window.api.checkForUpdates()} className={btn.secondary}>
            Check for updates
          </button>
        )}
      </div>
    </Section>
  )
}
