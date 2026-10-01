import { useState } from 'react'
import type { SaveResult } from '@shared/types'
import { PlusIcon, TrashIcon } from '../icons'
import { obj, strings, useDraftLayer, useSettings } from './context'
import { Badge, BoolSelect, btn, card, CodeEditor, Field, inputCls, list, NumberInput, SaveBar, SaveMessage, Section, StringList, TextInput } from './ui'

/** Everything in opencode's config that doesn't have its own tab. */
export function AdvancedSection(): React.JSX.Element {
  const layer = useDraftLayer()
  const { get, set } = layer
  const field = (path: string[]) => ({ value: get(path), onChange: (v: unknown) => set(path, v) })

  return (
    <div className="space-y-10">
      <Section title="Context & compaction" description="When a chat outgrows the context window, opencode summarizes older turns.">
        <div className={list}>
          <Field label="Auto-compact" hint="Summarize older messages when the context is full">
            <BoolSelect {...field(['compaction', 'auto'])} defaultLabel="on" />
          </Field>
          <Field label="Prune old tool output" hint="Drop old tool results to save tokens">
            <BoolSelect {...field(['compaction', 'prune'])} defaultLabel="off" />
          </Field>
          <Field label="Keep recent turns" hint="Turns kept verbatim when compacting (tail_turns)">
            <NumberInput {...field(['compaction', 'tail_turns'])} min={0} />
          </Field>
          <Field label="Keep recent tokens" hint="Tokens of recent context kept verbatim (preserve_recent_tokens)">
            <NumberInput {...field(['compaction', 'preserve_recent_tokens'])} min={0} step={1024} />
          </Field>
          <Field label="Reserved tokens" hint="Buffer kept free so compaction itself doesn’t overflow">
            <NumberInput {...field(['compaction', 'reserved'])} min={0} step={1024} />
          </Field>
        </div>
      </Section>

      <Section title="Tool output" description="Cap how much of a tool’s output (e.g. a long command log) goes back to the model.">
        <div className={list}>
          <Field label="Max lines" hint="tool_output.max_lines">
            <NumberInput {...field(['tool_output', 'max_lines'])} min={1} />
          </Field>
          <Field label="Max bytes" hint="tool_output.max_bytes">
            <NumberInput {...field(['tool_output', 'max_bytes'])} min={1} step={1024} />
          </Field>
        </div>
      </Section>

      <Section title="Image attachments" description="Images are resized before they’re sent to vision models (opencode default: 2000×2000 px, 5 MB).">
        <div className={list}>
          <Field label="Auto-resize">
            <BoolSelect {...field(['attachment', 'image', 'auto_resize'])} defaultLabel="on" />
          </Field>
          <Field label="Max width (px)">
            <NumberInput {...field(['attachment', 'image', 'max_width'])} min={1} />
          </Field>
          <Field label="Max height (px)">
            <NumberInput {...field(['attachment', 'image', 'max_height'])} min={1} />
          </Field>
          <Field label="Max encoded size (bytes)">
            <NumberInput {...field(['attachment', 'image', 'max_base64_bytes'])} min={1} step={1024} />
          </Field>
        </div>
      </Section>

      <Section title="Environment">
        <div className={list}>
          <Field label="Snapshots" hint="Track file changes so the agent’s edits can be undone; turn off for huge repos">
            <BoolSelect {...field(['snapshot'])} defaultLabel="on" />
          </Field>
          <Field label="Shell" hint="Shell for the agent’s commands (default: your login shell)">
            <TextInput {...field(['shell'])} placeholder="/bin/zsh" mono />
          </Field>
          <Field label="Your name" hint="How the agent refers to you (username)">
            <TextInput {...field(['username'])} placeholder="default: your macOS user" />
          </Field>
          <Field label="Log level" hint="opencode’s own log detail (logs live in Capy’s opencode data folder)">
            <select value={(get(['logLevel']) as string) ?? ''} onChange={(e) => set(['logLevel'], e.target.value || undefined)} className={inputCls}>
              <option value="">Default</option>
              {['DEBUG', 'INFO', 'WARN', 'ERROR'].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm">File watcher: ignore</p>
          <StringList
            items={strings(get(['watcher', 'ignore']))}
            placeholder="glob, e.g. node_modules/**"
            empty="Nothing extra ignored."
            onSave={async (items) => set(['watcher', 'ignore'], items.length ? items : undefined)}
          />
        </div>
      </Section>

      <Section title="Experimental" description="opencode features that may change or disappear between versions.">
        <div className={list}>
          <Field label="Batch tool" hint="Let the model run several tool calls in one step (batch_tool)">
            <BoolSelect {...field(['experimental', 'batch_tool'])} defaultLabel="off" />
          </Field>
          <Field label="Keep going after a denial" hint="Continue the task when you deny a permission instead of stopping (continue_loop_on_deny)">
            <BoolSelect {...field(['experimental', 'continue_loop_on_deny'])} defaultLabel="off" />
          </Field>
          <Field label="Don’t summarize pastes" hint="disable_paste_summary">
            <BoolSelect {...field(['experimental', 'disable_paste_summary'])} defaultLabel="off" />
          </Field>
          <Field label="OpenTelemetry" hint="Emit OpenTelemetry traces (openTelemetry)">
            <BoolSelect {...field(['experimental', 'openTelemetry'])} defaultLabel="off" />
          </Field>
          <Field label="MCP timeout (ms)" hint="How long to wait for MCP servers (mcp_timeout)">
            <NumberInput {...field(['experimental', 'mcp_timeout'])} min={0} step={1000} />
          </Field>
        </div>
        <div className="mt-4">
          <p className="mb-1 text-sm">Primary-only tools</p>
          <p className="mb-2 text-xs text-neutral-500">Tools only primary agents may use; subagents won’t get them (primary_tools).</p>
          <StringList
            items={strings(get(['experimental', 'primary_tools']))}
            placeholder="tool id, e.g. bash"
            empty="None."
            onSave={async (items) => set(['experimental', 'primary_tools'], items.length ? items : undefined)}
          />
        </div>
      </Section>

      <ReferencesSection layer={layer} />
      <ManagedSection />
      <RawJsonSection />
      <SaveBar dirty={layer.dirty} onSave={layer.save} onReset={layer.reset} />
    </div>
  )
}

/** `references`: named git repos or local folders the agent can consult. */
function ReferencesSection({ layer }: { layer: ReturnType<typeof useDraftLayer> }): React.JSX.Element {
  const refs = obj(layer.draft, 'references') as Record<string, string | { repository?: string; branch?: string; path?: string; description?: string }>
  const [form, setForm] = useState({ name: '', source: '', branch: '', description: '' })
  const isGit = /^(https?:\/\/|git@)/.test(form.source.trim())
  return (
    <Section title="References" description="Other codebases or docs folders the agent can look things up in: a git repository (cloned on demand) or a local path.">
      <div className="space-y-3">
        {Object.keys(refs).length > 0 && (
          <ul className={list}>
            {Object.entries(refs).map(([name, r]) => {
              const src = typeof r === 'string' ? r : (r.repository ?? r.path)
              return (
                <li key={name} className="flex items-center gap-3 px-3 py-2">
                  <span className="font-mono text-xs">{name}</span>
                  <Badge>{typeof r === 'object' && r.repository ? 'git' : 'local'}</Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-500">{src}</span>
                  <button onClick={() => layer.set(['references', name], undefined)} className="rounded p-1 text-neutral-500 hover:text-red-500">
                    <TrashIcon />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className={`${card} grid grid-cols-2 gap-2 p-3`}>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="name, e.g. react" className={`${inputCls} font-mono text-xs`} />
          <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="git URL or /local/path" className={`${inputCls} font-mono text-xs`} />
          <input
            value={form.branch}
            disabled={!isGit}
            onChange={(e) => setForm({ ...form, branch: e.target.value })}
            placeholder="branch (git only)"
            className={`${inputCls} font-mono text-xs disabled:opacity-40`}
          />
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="description (optional)" className={`${inputCls} text-xs`} />
          <div>
            <button
              disabled={!/^[a-z0-9_-]+$/i.test(form.name) || !form.source.trim()}
              onClick={() => {
                const source = form.source.trim()
                layer.set(['references', form.name], {
                  ...(isGit ? { repository: source, ...(form.branch && { branch: form.branch }) } : { path: source }),
                  ...(form.description && { description: form.description })
                })
                setForm({ name: '', source: '', branch: '', description: '' })
              }}
              className={btn.secondary}
            >
              <PlusIcon className="size-3.5" /> Add reference
            </button>
          </div>
        </div>
      </div>
    </Section>
  )
}

/** Keys Capy owns (or that only apply to opencode's terminal UI), so they aren't editable here. */
function ManagedSection(): React.JSX.Element {
  const rows: [string, string][] = [
    ['provider, model, enabled_providers', 'Capy registers the bundled Ollama and your installed models, and allows only that provider so nothing goes to a cloud API. Pick models in Models & general.'],
    ['small_model', 'Set in Models & general (“Model for titles & summaries”).'],
    ['server', 'Capy starts opencode on a random private port with a per-launch password.'],
    ['share, autoshare', 'Off: sharing uploads chats to opencode’s cloud.'],
    ['autoupdate', 'Off: Capy ships a tested opencode version and updates it with the app.'],
    ['keybinds, layout, tui, theme', 'Only used by opencode’s terminal UI.'],
    ['mode', 'Deprecated alias for agent; use the Agents tab.']
  ]
  return (
    <Section title="Managed by Capy" description="These opencode settings are set by Capy or don’t apply to a desktop app. You can still override them in the JSON below, at your own risk.">
      <ul className={list}>
        {rows.map(([keys, why]) => (
          <li key={keys} className="px-3 py-2">
            <code className="font-mono text-xs">{keys}</code>
            <p className="text-xs text-neutral-500">{why}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function RawJsonSection(): React.JSX.Element {
  const { settings, save } = useSettings()
  const [raw, setRaw] = useState(() => JSON.stringify(settings.opencode, null, 2))
  const [result, setResult] = useState<SaveResult>()
  const [effective, setEffective] = useState<string>()

  let rawError: string | undefined
  try {
    const parsed: unknown = JSON.parse(raw || '{}')
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) rawError = 'Must be a JSON object.'
  } catch (err) {
    rawError = (err as Error).message
  }
  const rawDirty = !rawError && JSON.stringify(JSON.parse(raw || '{}')) !== JSON.stringify(settings.opencode)

  return (
    <Section
      title="opencode config (JSON)"
      description={
        <>
          Every settings screen edits this object, which is merged over the config Capy generates. Anything opencode supports works here. Reference:{' '}
          <a href="https://opencode.ai/docs/config/" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
            opencode.ai/docs/config
          </a>
        </>
      }
    >
      <CodeEditor value={raw} onChange={setRaw} rows={16} />
      <div className="mt-2 flex items-center gap-3">
        <button disabled={!rawDirty} onClick={async () => setResult(await save({ opencode: JSON.parse(raw || '{}') }))} className={btn.primary}>
          Save JSON
        </button>
        <button onClick={() => setRaw(JSON.stringify(settings.opencode, null, 2))} className={btn.ghost}>
          Reload
        </button>
        {rawError && <p className="text-xs text-red-500">{rawError}</p>}
        <SaveMessage result={result} />
      </div>
      <details
        className="mt-4"
        onToggle={async (e) => {
          if ((e.target as HTMLDetailsElement).open) setEffective(JSON.stringify(await window.api.getEffectiveConfig(), null, 2))
        }}
      >
        <summary className="cursor-pointer text-xs text-neutral-500">View the full config opencode is running with</summary>
        <pre className="selectable mt-2 max-h-96 overflow-auto rounded-md bg-neutral-100 p-3 font-mono text-xs dark:bg-neutral-900">{effective}</pre>
      </details>
    </Section>
  )
}
