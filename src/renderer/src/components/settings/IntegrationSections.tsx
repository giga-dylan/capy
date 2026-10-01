import { useState } from 'react'
import type { SaveResult } from '@shared/types'
import { PlusIcon, TrashIcon } from '../icons'
import { ensure, obj, prune, strings, useSettings } from './context'
import { ExtensionManager } from './ExtensionManager'
import { pluginTemplate, toolTemplate } from './templates'
import { Badge, btn, card, CodeEditor, inputCls, list, SaveMessage, Section, StringList, Toggle } from './ui'

// ---------------------------------------------------------------- MCP servers

type McpServer =
  | { type: 'local'; command: string[]; environment?: Record<string, string>; cwd?: string; enabled?: boolean; timeout?: number }
  | { type: 'remote'; url: string; headers?: Record<string, string>; oauth?: false | Record<string, unknown>; enabled?: boolean; timeout?: number }

/** "KEY=value" lines <-> object. */
const parsePairs = (text: string, sep: string): Record<string, string> =>
  Object.fromEntries(
    text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf(sep)).trim(), l.slice(l.indexOf(sep) + sep.length).trim()])
      .filter(([k]) => k)
  )
const formatPairs = (pairs: Record<string, string> | undefined, sep: string): string =>
  Object.entries(pairs ?? {})
    .map(([k, v]) => `${k}${sep}${v}`)
    .join('\n')

/** Splits a command line, honouring "double" and 'single' quotes. */
function splitCommand(text: string): string[] {
  return [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3])
}
const joinCommand = (parts: string[]): string => parts.map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(' ')

interface McpForm {
  name: string
  type: 'local' | 'remote'
  command: string
  url: string
  pairs: string
  cwd: string
  timeout: string
  oauth: boolean
}
const EMPTY_FORM: McpForm = { name: '', type: 'local', command: '', url: '', pairs: '', cwd: '', timeout: '', oauth: true }

function toForm(name: string, s: McpServer): McpForm {
  return s.type === 'local'
    ? { ...EMPTY_FORM, name, type: 'local', command: joinCommand(s.command ?? []), pairs: formatPairs(s.environment, '='), cwd: s.cwd ?? '', timeout: s.timeout?.toString() ?? '' }
    : { ...EMPTY_FORM, name, type: 'remote', url: s.url, pairs: formatPairs(s.headers, ': '), timeout: s.timeout?.toString() ?? '', oauth: s.oauth !== false }
}

function fromForm(f: McpForm, previous?: McpServer): McpServer {
  const common = { ...(previous?.enabled === false && { enabled: false }), ...(f.timeout && { timeout: Number(f.timeout) }) }
  return f.type === 'local'
    ? { type: 'local', command: splitCommand(f.command), ...(f.pairs.trim() && { environment: parsePairs(f.pairs, '=') }), ...(f.cwd.trim() && { cwd: f.cwd.trim() }), ...common }
    : { type: 'remote', url: f.url.trim(), ...(f.pairs.trim() && { headers: parsePairs(f.pairs, ':') }), ...(!f.oauth && { oauth: false as const }), ...common }
}

export function McpSection(): React.JSX.Element {
  const { settings, inventory, updateOpencode } = useSettings()
  const servers = obj(settings.opencode, 'mcp') as Record<string, McpServer>
  // undefined = closed, '' = adding a new server, otherwise the name being edited.
  const [editing, setEditing] = useState<string>()
  const [form, setForm] = useState<McpForm>(EMPTY_FORM)
  const [result, setResult] = useState<SaveResult>()

  const statusBadge = (name: string): React.JSX.Element | null => {
    const st = inventory?.mcp[name]
    if (!st) return null
    const tone = { connected: 'green', disabled: 'neutral', failed: 'red' }[st.status] ?? 'amber'
    return (
      <span title={st.error}>
        <Badge tone={tone as 'green'}>{st.status.replace(/_/g, ' ')}</Badge>
      </span>
    )
  }

  function open(name?: string): void {
    setEditing(name ?? '')
    setForm(name ? toForm(name, servers[name]) : EMPTY_FORM)
  }

  async function submit(): Promise<void> {
    const name = form.name.trim()
    const res = await updateOpencode((config) => {
      ensure(config, 'mcp')[name] = fromForm(form, servers[name])
    })
    setResult(res)
    if (res.ok) setEditing(undefined)
  }

  const valid =
    /^[a-zA-Z0-9_-]+$/.test(form.name.trim()) &&
    (editing || !servers[form.name.trim()]) &&
    (form.type === 'local' ? form.command.trim() : /^https?:\/\//.test(form.url.trim())) &&
    (!form.timeout || Number(form.timeout) > 0)

  return (
    <Section
      title="MCP servers"
      description="Model Context Protocol servers give the agent extra tools (GitHub, databases, browsers, …). Local servers run as a command on this Mac; remote servers are reached by URL."
      actions={
        editing === undefined && (
          <button onClick={() => open()} className={btn.secondary}>
            <PlusIcon className="size-3.5" /> Add server
          </button>
        )
      }
    >
      <div className="space-y-3">
        {Object.keys(servers).length === 0 && editing === undefined && <p className="text-sm text-neutral-500">No MCP servers yet.</p>}
        {Object.keys(servers).length > 0 && (
          <ul className={list}>
            {Object.entries(servers).map(([name, s]) => (
              <li key={name} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs">{name}</span>
                    <Badge>{s.type}</Badge>
                    {statusBadge(name)}
                  </p>
                  <p className="truncate font-mono text-xs text-neutral-500">{s.type === 'local' ? joinCommand(s.command ?? []) : s.url}</p>
                  {inventory?.mcp[name]?.error && <p className="selectable truncate text-xs text-red-500">{inventory.mcp[name].error}</p>}
                </div>
                <button onClick={() => open(name)} className={btn.ghost}>
                  Edit
                </button>
                <Toggle
                  checked={s.enabled !== false}
                  onChange={(on) =>
                    updateOpencode((config) => {
                      const server = ensure(config, 'mcp', name)
                      if (on) delete server.enabled
                      else server.enabled = false
                    }).then(setResult)
                  }
                />
                <button
                  title="Remove"
                  onClick={() =>
                    updateOpencode((config) => {
                      delete ensure(config, 'mcp')[name]
                      prune(config, 'mcp')
                    }).then(setResult)
                  }
                  className="rounded p-1 text-neutral-500 hover:text-red-500"
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )}

        {editing !== undefined && (
          <div className={`${card} space-y-3 p-3`}>
            <div className="flex gap-2">
              <input
                value={form.name}
                disabled={!!editing}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="name, e.g. github"
                className={`${inputCls} flex-1 font-mono text-xs disabled:opacity-60`}
              />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'local' })} className={inputCls}>
                <option value="local">Local (command)</option>
                <option value="remote">Remote (URL)</option>
              </select>
            </div>
            {form.type === 'local' ? (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  value={form.command}
                  onChange={(e) => setForm({ ...form, command: e.target.value })}
                  placeholder="npx -y @modelcontextprotocol/server-github"
                  className={`${inputCls} font-mono text-xs`}
                />
                <input value={form.cwd} onChange={(e) => setForm({ ...form, cwd: e.target.value })} placeholder="working folder (optional)" className={`${inputCls} w-56 font-mono text-xs`} />
              </div>
            ) : (
              <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://mcp.example.com/mcp" className={`${inputCls} w-full font-mono text-xs`} />
            )}
            <CodeEditor
              value={form.pairs}
              onChange={(pairs) => setForm({ ...form, pairs })}
              rows={3}
              placeholder={form.type === 'local' ? 'Environment, one per line:\nGITHUB_TOKEN=ghp_…' : 'Headers, one per line:\nAuthorization: Bearer …'}
            />
            <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500">
              <label className="flex items-center gap-2">
                Timeout (ms)
                <input value={form.timeout} onChange={(e) => setForm({ ...form, timeout: e.target.value.replace(/\D/g, '') })} placeholder="default" className={`${inputCls} w-24 text-right`} />
              </label>
              {form.type === 'remote' && (
                <label className="flex items-center gap-2">
                  <Toggle checked={form.oauth} onChange={(oauth) => setForm({ ...form, oauth })} />
                  Sign in with OAuth when the server asks
                </label>
              )}
            </div>
            <div className="flex gap-2">
              <button disabled={!valid} onClick={submit} className={btn.primary}>
                {editing ? 'Save' : 'Add'}
              </button>
              <button onClick={() => setEditing(undefined)} className={btn.ghost}>
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-neutral-500">Values (including tokens) are stored in Capy’s settings file on this Mac.</p>
          </div>
        )}
        <SaveMessage result={result} />
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------- Plugins & hooks

export function PluginsSection(): React.JSX.Element {
  const { settings, updateOpencode } = useSettings()
  return (
    <div className="space-y-10">
      <Section
        title="Plugins & hooks"
        description={
          <>
            Plugins are JavaScript/TypeScript files that hook into the agent: block or change tool calls (<code className="font-mono">tool.execute.before</code>
            /<code className="font-mono">after</code>), react to events (<code className="font-mono">session.idle</code>,{' '}
            <code className="font-mono">file.edited</code>, <code className="font-mono">permission.asked</code>, …), set shell env, and more.
          </>
        }
      >
        <ExtensionManager kind="plugin" noun="plugin" namePlaceholder="notify.ts" template={pluginTemplate} fileHint={(n) => `plugins/${n}`} />
      </Section>
      <Section title="npm plugins" description="Published plugins, installed automatically when the agent engine starts. Optionally pin a version (name@1.2.3).">
        <StringList
          items={strings(settings.opencode.plugin)}
          placeholder="opencode-plugin-name"
          empty="None."
          onSave={(items) =>
            updateOpencode((config) => {
              if (items.length) config.plugin = items
              else delete config.plugin
            })
          }
        />
      </Section>
    </div>
  )
}

// ---------------------------------------------------------------- Tools

export function ToolsSection(): React.JSX.Element {
  const { settings, inventory, updateOpencode } = useSettings()
  const toggles = obj(settings.opencode, 'tools')
  const ids = [...new Set([...(inventory?.tools ?? []), ...Object.keys(toggles)])].filter((t) => t !== 'invalid').sort()
  return (
    <div className="space-y-10">
      <Section title="Tools" description="Turn off tools you don’t want any agent to use. To limit a tool instead of removing it, use Permissions.">
        <ul className={`${list} grid grid-cols-2 divide-y-0 sm:grid-cols-3`}>
          {ids.map((id) => (
            <li key={id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{id}</span>
              <Toggle
                checked={toggles[id] !== false}
                onChange={(on) =>
                  updateOpencode((config) => {
                    const t = ensure(config, 'tools')
                    if (on) delete t[id]
                    else t[id] = false
                    prune(config, 'tools')
                  })
                }
              />
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Custom tools" description="Your own tools in TypeScript/JavaScript. The file name becomes the tool name; a tool with a built-in’s name replaces it.">
        <ExtensionManager kind="tool" noun="tool" namePlaceholder="current-time" template={toolTemplate} fileHint={(n) => `tools/${n}.ts → tool "${n}"`} />
      </Section>
    </div>
  )
}
