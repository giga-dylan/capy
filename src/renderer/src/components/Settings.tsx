import { useEffect, useState } from 'react'
import { PERMISSION_KEYS, type AppSettings, type PermissionKey, type PermissionLevel } from '@shared/types'
import { ArrowLeftIcon } from './icons'
import { ModelLibrary } from './ModelLibrary'

const PERMISSION_INFO: Record<PermissionKey, { label: string; hint: string }> = {
  edit: { label: 'Edit files', hint: 'Create, modify or delete files' },
  bash: { label: 'Run shell commands', hint: 'Any command in the terminal' },
  webfetch: { label: 'Fetch web pages', hint: 'Download content from URLs' },
  external_directory: { label: 'Outside the project', hint: 'Touch files outside the chat’s folder' }
}

const CONTEXT_OPTIONS = [8192, 16384, 32768, 65536, 131072, 262144]

const input =
  'rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900'
const btn = 'rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40'

export function Settings({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [saved, setSaved] = useState<AppSettings>()
  const [draft, setDraft] = useState<AppSettings>()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string }>()
  const [effective, setEffective] = useState<string>()

  useEffect(() => {
    const load = (): void =>
      void window.api.getSettings().then((s) => {
        setSaved(s)
        // Keep unsaved edits, but pick up changes made elsewhere (e.g. active model).
        setDraft((d) => (d ? { ...d, model: s.model, modelsDir: s.modelsDir } : s))
      })
    load()
    return window.api.onStatus(load)
  }, [])

  if (!saved || !draft) return <div className="flex-1" />

  const dirty = (['contextLength', 'maxOutputTokens', 'permissions', 'opencodeOverrides'] as const).some(
    (k) => JSON.stringify(draft[k]) !== JSON.stringify(saved[k])
  )
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void => setDraft({ ...draft, [key]: value })

  async function save(patch: Partial<AppSettings>): Promise<void> {
    setSaving(true)
    setMessage(undefined)
    const res = await window.api.saveSettings(patch)
    setSaving(false)
    if (res.ok) {
      setSaved(res.settings)
      setDraft(res.settings)
      setMessage({ ok: true, text: 'Saved. Services restarted with the new settings.' })
      if (effective) setEffective(JSON.stringify(await window.api.getEffectiveConfig(), null, 2))
    } else setMessage({ ok: false, text: res.error })
  }

  async function changeModelsDir(dir: string | undefined): Promise<void> {
    await save({ modelsDir: dir })
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-white dark:bg-neutral-950">
      <div className="drag h-12 shrink-0" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-10 px-6 pb-24">
          <div className="flex items-center gap-3">
            <button onClick={onBack} title="Back to chat" className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              <ArrowLeftIcon />
            </button>
            <h1 className="text-xl font-semibold">Settings</h1>
          </div>

          <Section title="Models" description="The active model is used for new messages. You can also switch it from the chat box.">
            <ModelLibrary activeModel={saved.model} />
          </Section>

          <Section title="Model storage" description="Where Ollama keeps downloaded models. Changing it restarts Ollama; models in the old folder won't show up.">
            <div className="flex items-center gap-2">
              <code className="selectable min-w-0 flex-1 truncate rounded-md bg-neutral-100 px-2 py-1.5 font-mono text-xs dark:bg-neutral-900">
                {saved.modelsDir ?? '~/.ollama/models (default, shared with Ollama)'}
              </code>
              <button
                disabled={saving}
                onClick={async () => {
                  const dir = await window.api.chooseModelsDir()
                  if (dir) changeModelsDir(dir)
                }}
                className={`${btn} border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800`}
              >
                Change…
              </button>
              {saved.modelsDir && (
                <button disabled={saving} onClick={() => changeModelsDir(undefined)} className={`${btn} text-neutral-500 hover:text-neutral-900 dark:hover:text-white`}>
                  Use default
                </button>
              )}
            </div>
          </Section>

          <Section title="Agent permissions" description="What the agent may do without asking. “Ask” shows an approval card in the chat.">
            <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {PERMISSION_KEYS.map((key) => (
                <div key={key} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1">
                    <p className="text-sm">{PERMISSION_INFO[key].label}</p>
                    <p className="text-xs text-neutral-500">{PERMISSION_INFO[key].hint}</p>
                  </div>
                  <select
                    value={draft.permissions[key]}
                    onChange={(e) => set('permissions', { ...draft.permissions, [key]: e.target.value as PermissionLevel })}
                    className={input}
                  >
                    <option value="ask">Ask</option>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Limits" description="Larger context lets the agent see more code but uses more memory and makes each step slower.">
            <div className="flex flex-wrap gap-6">
              <label className="space-y-1">
                <span className="block text-xs text-neutral-500">Context window</span>
                <select value={draft.contextLength} onChange={(e) => set('contextLength', Number(e.target.value))} className={input}>
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
                  value={draft.maxOutputTokens}
                  onChange={(e) => set('maxOutputTokens', Number(e.target.value))}
                  className={`${input} w-32`}
                />
              </label>
            </div>
          </Section>

          <Section
            title="Advanced: opencode config"
            description="A JSON object merged over the config the app generates. Anything opencode supports works here: agents, instructions, MCP servers, tools, permissions per command, and more."
          >
            <textarea
              value={draft.opencodeOverrides}
              onChange={(e) => set('opencodeOverrides', e.target.value)}
              spellCheck={false}
              rows={10}
              placeholder={'{\n  "permission": { "bash": { "git status": "allow", "*": "ask" } }\n}'}
              className={`${input} selectable block w-full font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-neutral-500">
              Reference:{' '}
              <a href="https://opencode.ai/docs/config/" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                opencode.ai/docs/config
              </a>
            </p>
            <details
              className="mt-3"
              onToggle={async (e) => {
                if ((e.target as HTMLDetailsElement).open) setEffective(JSON.stringify(await window.api.getEffectiveConfig(), null, 2))
              }}
            >
              <summary className="cursor-pointer text-xs text-neutral-500">View the full config the app is running with</summary>
              <pre className="selectable mt-2 max-h-96 overflow-auto rounded-md bg-neutral-100 p-3 font-mono text-xs dark:bg-neutral-900">{effective}</pre>
            </details>
          </Section>
        </div>
      </div>

      {(dirty || message) && (
        <div className="border-t border-neutral-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            {message && <p className={`selectable flex-1 text-xs ${message.ok ? 'text-emerald-500' : 'text-red-500'}`}>{message.text}</p>}
            {dirty && (
              <>
                <p className="flex-1 text-xs text-neutral-500">Saving restarts the agent engine. Tasks in progress will stop.</p>
                <button onClick={() => setDraft(saved)} disabled={saving} className={`${btn} text-neutral-500 hover:text-neutral-900 dark:hover:text-white`}>
                  Discard
                </button>
                <button
                  onClick={() =>
                    save({
                      contextLength: draft.contextLength,
                      maxOutputTokens: draft.maxOutputTokens,
                      permissions: draft.permissions,
                      opencodeOverrides: draft.opencodeOverrides
                    })
                  }
                  disabled={saving}
                  className={`${btn} bg-blue-600 text-white hover:bg-blue-500`}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 mb-3 text-sm text-neutral-500">{description}</p>
      {children}
    </section>
  )
}
