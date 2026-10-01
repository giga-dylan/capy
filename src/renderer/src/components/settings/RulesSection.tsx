import { useEffect, useState } from 'react'
import { strings, useSettings } from './context'
import { btn, CodeEditor, errorText, Section, StringList, Toggle } from './ui'

export function RulesSection(): React.JSX.Element {
  const { settings, save, updateOpencode } = useSettings()
  const [saved, setSaved] = useState<string>()
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; text: string }>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.getRules().then((r) => {
      setSaved(r)
      setDraft(r)
    })
  }, [])

  return (
    <div className="space-y-10">
      <Section
        title="Global rules"
        description={
          <>
            Instructions every agent follows in every chat (opencode’s global <code className="font-mono">AGENTS.md</code>). A project’s own{' '}
            <code className="font-mono">AGENTS.md</code> is added on top when you chat in that folder.
          </>
        }
      >
        <CodeEditor
          value={draft}
          onChange={setDraft}
          rows={14}
          placeholder={'# Rules\n\n- Prefer small, focused changes.\n- Run the tests after editing code.\n- Never commit without asking.'}
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            disabled={saving || saved === undefined || draft === saved}
            onClick={async () => {
              setSaving(true)
              try {
                await window.api.saveRules(draft)
                setSaved(draft)
                setStatus({ ok: true, text: 'Saved. The agent engine restarted with your rules.' })
              } catch (err) {
                setStatus({ ok: false, text: errorText(err) })
              }
              setSaving(false)
            }}
            className={btn.primary}
          >
            {saving ? 'Saving…' : 'Save rules'}
          </button>
          {status && <p className={`text-xs ${status.ok ? 'text-emerald-500' : 'text-red-500'}`}>{status.text}</p>}
        </div>
      </Section>

      <Section
        title="Extra instruction files"
        description="More files to include as instructions: paths relative to the chat’s folder, globs, or https URLs (fetched with a 5 s timeout)."
      >
        <StringList
          items={strings(settings.opencode.instructions)}
          placeholder="CONTRIBUTING.md, docs/*.md or https://…"
          empty="None."
          onSave={(items) =>
            updateOpencode((config) => {
              if (items.length) config.instructions = items
              else delete config.instructions
            })
          }
        />
      </Section>

      <Section title="Claude Code rules" description="Also load CLAUDE.md files (project CLAUDE.md and ~/.claude/CLAUDE.md) when no AGENTS.md is found.">
        <div className="flex items-center gap-3">
          <Toggle checked={settings.claudeRules} onChange={(v) => save({ claudeRules: v })} />
          <span className="text-sm">Load CLAUDE.md rules</span>
        </div>
      </Section>
    </div>
  )
}
