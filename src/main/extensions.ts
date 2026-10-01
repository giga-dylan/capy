import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import type { ExtensionFile, ExtensionKind } from '@shared/types'

/** opencode's data/config root for the app (passed as XDG_* to the opencode process). */
export function opencodeHome(): string {
  return join(app.getPath('userData'), 'opencode')
}

/** opencode's global config folder: $XDG_CONFIG_HOME/opencode. */
export function opencodeConfigDir(): string {
  const dir = join(opencodeHome(), 'config', 'opencode')
  mkdirSync(dir, { recursive: true })
  return dir
}

const LAYOUT: Record<ExtensionKind, { dir: string; exts: string[] }> = {
  agent: { dir: 'agents', exts: ['.md'] },
  command: { dir: 'commands', exts: ['.md'] },
  skill: { dir: 'skills', exts: [] }, // skills/<name>/SKILL.md
  plugin: { dir: 'plugins', exts: ['.ts', '.js'] },
  tool: { dir: 'tools', exts: ['.ts', '.js'] }
}

// Skill names must match opencode's pattern; the others become file names, so keep them simple too.
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/
const PLUGIN_NAME = /^[a-z0-9]+(-[a-z0-9]+)*\.(ts|js)$/

function filePath(kind: ExtensionKind, name: string): string {
  const { dir } = LAYOUT[kind]
  const root = join(opencodeConfigDir(), dir)
  if (kind === 'skill') return join(root, name, 'SKILL.md')
  if (kind === 'plugin') return join(root, name)
  if (kind === 'tool') return join(root, existsSync(join(root, `${name}.js`)) ? `${name}.js` : `${name}.ts`)
  return join(root, `${name}.md`)
}

export function validateName(kind: ExtensionKind, name: string): string | undefined {
  if (kind === 'plugin') {
    return PLUGIN_NAME.test(name) ? undefined : 'Use lowercase letters, numbers and hyphens, ending in .ts or .js (e.g. notify.ts).'
  }
  return NAME.test(name) && name.length <= 64 ? undefined : 'Use lowercase letters, numbers and single hyphens (e.g. code-review).'
}

export function listExtensions(kind: ExtensionKind): ExtensionFile[] {
  const { dir, exts } = LAYOUT[kind]
  const root = join(opencodeConfigDir(), dir)
  if (!existsSync(root)) return []
  return readdirSync(root)
    .flatMap((entry): ExtensionFile[] => {
      const full = join(root, entry)
      if (kind === 'skill') {
        const skillFile = join(full, 'SKILL.md')
        return statSync(full).isDirectory() && existsSync(skillFile) ? [{ kind, name: entry, path: skillFile, content: readFileSync(skillFile, 'utf8') }] : []
      }
      if (!exts.includes(extname(entry))) return []
      const name = kind === 'plugin' ? entry : entry.slice(0, -extname(entry).length)
      return [{ kind, name, path: full, content: readFileSync(full, 'utf8') }]
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function writeExtension(kind: ExtensionKind, name: string, content: string): void {
  const error = validateName(kind, name)
  if (error) throw new Error(error)
  const path = filePath(kind, name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

export function deleteExtension(kind: ExtensionKind, name: string): void {
  if (validateName(kind, name)) return
  const path = filePath(kind, name)
  rmSync(kind === 'skill' ? dirname(path) : path, { recursive: true, force: true })
}

const rulesFile = (): string => join(opencodeConfigDir(), 'AGENTS.md')

export function readRules(): string {
  return existsSync(rulesFile()) ? readFileSync(rulesFile(), 'utf8') : ''
}

export function writeRules(content: string): void {
  if (content.trim()) writeFileSync(rulesFile(), content)
  else rmSync(rulesFile(), { force: true })
}
