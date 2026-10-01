import { useState } from 'react'
import { AgentOverrides } from './AgentOverrides'
import { ensure, obj, prune, strings, useSettings } from './context'
import { ExtensionManager } from './ExtensionManager'
import { agentTemplate, commandHelp, commandTemplate, skillTemplate } from './templates'
import { Badge, btn, inputCls, list, NumberInput, Section, StringList, Toggle } from './ui'

/** Built-in agents users may switch off (title/summary/compaction are internal). */
const DISABLEABLE = new Set(['plan', 'general', 'explore'])

export function AgentsSection(): React.JSX.Element {
  const { settings, inventory, updateOpencode } = useSettings()
  const agents = (inventory?.agents ?? []).filter((a) => !a.hidden)
  const primary = agents.filter((a) => a.mode !== 'subagent')
  const disabled = (name: string): boolean => obj(settings.opencode, 'agent', name).disable === true
  const defaultAgent = typeof settings.opencode.default_agent === 'string' ? settings.opencode.default_agent : 'build'
  const [customizing, setCustomizing] = useState<string>()
  const customized = (name: string): boolean => Object.keys(obj(settings.opencode, 'agent', name)).some((k) => k !== 'disable')

  return (
    <div className="space-y-10">
      <Section
        title="Agents"
        description="Primary agents are chat modes: switch with /name in the chat box (e.g. /plan, /build). Subagents are called by other agents (or with @name in a message) for focused jobs."
        actions={
          <label className="flex items-center gap-2 text-xs text-neutral-500">
            Default
            <select
              value={defaultAgent}
              onChange={(e) =>
                updateOpencode((config) => {
                  if (e.target.value === 'build') delete config.default_agent
                  else config.default_agent = e.target.value
                })
              }
              className={inputCls}
            >
              {primary.map((a) => (
                <option key={a.name}>{a.name}</option>
              ))}
            </select>
          </label>
        }
      >
        <ul className={list}>
          {agents.map((a) => (
            <li key={a.name} className="px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs">{a.name}</span>
                    <Badge tone={a.mode === 'subagent' ? 'neutral' : 'blue'}>{a.mode === 'subagent' ? 'subagent' : 'primary'}</Badge>
                    {a.native ? <Badge>built-in</Badge> : <Badge tone="green">custom</Badge>}
                    {customized(a.name) && <Badge tone="amber">customized</Badge>}
                  </p>
                  {a.description && <p className="truncate text-xs text-neutral-500">{a.description}</p>}
                </div>
                <button onClick={() => setCustomizing(customizing === a.name ? undefined : a.name)} className={btn.ghost}>
                  Customize
                </button>
                {a.native && DISABLEABLE.has(a.name) && (
                  <Toggle
                    checked={!disabled(a.name)}
                    onChange={(on) =>
                      updateOpencode((config) => {
                        const agent = ensure(config, 'agent', a.name)
                        if (on) delete agent.disable
                        else agent.disable = true
                        prune(config, 'agent', a.name)
                      })
                    }
                  />
                )}
              </div>
              {customizing === a.name && <AgentOverrides name={a.name} native={a.native} onClose={() => setCustomizing(undefined)} />}
            </li>
          ))}
          {Object.keys(obj(settings.opencode, 'agent'))
            .filter((name) => disabled(name))
            .map((name) => (
              <li key={name} className="flex items-center gap-3 px-3 py-2.5 opacity-60">
                <p className="flex-1 text-sm">
                  <span className="font-mono text-xs">{name}</span> <Badge>off</Badge>
                </p>
                <Toggle
                  checked={false}
                  onChange={() =>
                    updateOpencode((config) => {
                      delete ensure(config, 'agent', name).disable
                      prune(config, 'agent', name)
                    })
                  }
                />
              </li>
            ))}
        </ul>
      </Section>

      <Section title="Subagents" description="How many levels deep subagents may call other subagents (opencode default: 1).">
        <NumberInput
          value={settings.opencode.subagent_depth}
          min={0}
          onChange={(v) =>
            updateOpencode((config) => {
              if (v === undefined) delete config.subagent_depth
              else config.subagent_depth = v
            })
          }
        />
      </Section>

      <Section
        title="Your agents"
        description="Markdown files with settings at the top (description, mode, model, temperature, permission) and the agent’s system prompt below."
      >
        <ExtensionManager
          kind="agent"
          noun="agent"
          namePlaceholder="reviewer"
          template={agentTemplate}
          fileHint={(n) => `agents/${n}.md → agent "${n}"`}
        />
      </Section>
    </div>
  )
}

export function CommandsSection(): React.JSX.Element {
  const { inventory } = useSettings()
  const commands = (inventory?.commands ?? []).filter((c) => c.source !== 'skill')
  return (
    <div className="space-y-10">
      <Section title="Commands" description={commandHelp}>
        <ul className={list}>
          {commands.map((c) => (
            <li key={c.name} className="flex items-center gap-3 px-3 py-2.5">
              <span className="font-mono text-xs">/{c.name}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{c.description}</span>
              {c.source === 'mcp' && <Badge tone="amber">MCP</Badge>}
              {c.agent && <Badge>{c.agent}</Badge>}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Your commands" description="Reusable prompts. The file name is the command name; the body is the prompt template.">
        <ExtensionManager
          kind="command"
          noun="command"
          namePlaceholder="test"
          template={commandTemplate}
          fileHint={(n) => `commands/${n}.md → /${n}`}
        />
      </Section>
    </div>
  )
}

export function SkillsSection(): React.JSX.Element {
  const { settings, inventory, save, updateOpencode } = useSettings()
  const skills = inventory?.skills ?? []
  const source = (location: string): { label: string; tone: 'neutral' | 'green' | 'amber' } => {
    if (location === '<built-in>') return { label: 'built-in', tone: 'neutral' }
    if (location.includes('/Capy/opencode/')) return { label: 'yours', tone: 'green' }
    if (location.includes('/.claude/')) return { label: 'Claude Code', tone: 'amber' }
    return { label: 'external', tone: 'neutral' }
  }

  return (
    <div className="space-y-10">
      <Section
        title="Skills"
        description="Instruction packs the agent loads on demand. Only each skill’s name and description are in every prompt; the rest loads when the agent decides it’s relevant. Each skill is also a /command."
      >
        <ul className={list}>
          {skills.map((s) => {
            const src = source(s.location)
            return (
              <li key={s.location} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs">{s.name}</span>
                    <Badge tone={src.tone}>{src.label}</Badge>
                  </p>
                  <p className="truncate text-xs text-neutral-500" title={s.description}>
                    {s.description}
                  </p>
                </div>
                {s.location !== '<built-in>' && (
                  <button
                    onClick={() => window.api.revealPath(s.location)}
                    className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  >
                    Show
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </Section>

      <Section
        title="Your skills"
        description="Each skill is a folder with a SKILL.md: a name and description at the top, then the instructions."
      >
        <ExtensionManager
          kind="skill"
          noun="skill"
          namePlaceholder="release-notes"
          template={skillTemplate}
          fileHint={(n) => `skills/${n}/SKILL.md`}
        />
      </Section>

      <Section title="More skill sources" description="Extra folders, or URLs of skill collections, to load skills from.">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Toggle checked={settings.claudeSkills} onChange={(v) => save({ claudeSkills: v })} />
            <span className="text-sm">Load Claude Code skills (~/.claude/skills)</span>
          </div>
          {(['paths', 'urls'] as const).map((key) => (
            <div key={key}>
              <p className="mb-1 text-xs text-neutral-500">{key === 'paths' ? 'Folders' : 'URLs'}</p>
              <StringList
                items={strings(obj(settings.opencode, 'skills')[key])}
                placeholder={key === 'paths' ? '/path/to/skills' : 'https://…'}
                onSave={(items) =>
                  updateOpencode((config) => {
                    const s = ensure(config, 'skills')
                    if (items.length) s[key] = items
                    else delete s[key]
                    prune(config, 'skills')
                  })
                }
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
