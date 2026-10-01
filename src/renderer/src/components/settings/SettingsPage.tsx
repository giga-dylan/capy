import { useState } from 'react'
import { ArrowLeftIcon } from '../icons'
import { SettingsProvider, useSettings } from './context'
import { AgentsSection, CommandsSection, SkillsSection } from './ExtensionSections'
import { GeneralSection } from './GeneralSection'
import { AdvancedSection } from './AdvancedSection'
import { CodeToolsSection } from './CodeToolsSection'
import { McpSection, PluginsSection, ToolsSection } from './IntegrationSections'
import { PermissionsSection } from './PermissionsSection'
import { RulesSection } from './RulesSection'

const TABS = {
  general: { label: 'Models & general', Component: GeneralSection },
  permissions: { label: 'Permissions', Component: PermissionsSection },
  rules: { label: 'Rules', Component: RulesSection },
  agents: { label: 'Agents', Component: AgentsSection },
  commands: { label: 'Commands', Component: CommandsSection },
  skills: { label: 'Skills', Component: SkillsSection },
  mcp: { label: 'MCP servers', Component: McpSection },
  plugins: { label: 'Plugins & hooks', Component: PluginsSection },
  tools: { label: 'Tools', Component: ToolsSection },
  code: { label: 'Formatters & LSP', Component: CodeToolsSection },
  advanced: { label: 'Advanced', Component: AdvancedSection }
} as const
type Tab = keyof typeof TABS

export function SettingsPage({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('general')
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-neutral-950">
      <div className="drag h-12 shrink-0" />
      <SettingsProvider>
        <div className="flex min-h-0 flex-1">
          <nav className="w-48 shrink-0 space-y-0.5 px-3">
            <button onClick={onBack} className="mb-3 flex items-center gap-2 rounded-md px-2 py-1 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
              <ArrowLeftIcon className="size-3.5" /> Back to chat
            </button>
            {(Object.keys(TABS) as Tab[]).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`block w-full rounded-md px-2 py-1.5 text-left text-sm ${tab === key ? 'bg-neutral-100 font-medium dark:bg-neutral-800' : 'text-neutral-600 hover:bg-neutral-100/70 dark:text-neutral-400 dark:hover:bg-neutral-800/60'}`}
              >
                {TABS[key].label}
              </button>
            ))}
            <ConfigFolderLink />
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-6 pb-24">
              {/* Keyed so each tab starts from fresh saved state. */}
              <TabBody key={tab} tab={tab} />
            </div>
          </div>
        </div>
      </SettingsProvider>
    </main>
  )
}

function TabBody({ tab }: { tab: Tab }): React.JSX.Element {
  const { Component } = TABS[tab]
  const { inventory } = useSettings()
  return (
    <>
      {inventory?.errors.length ? <p className="mb-4 text-xs text-amber-500">Some live info couldn’t be loaded: {inventory.errors[0]}</p> : null}
      <Component />
    </>
  )
}

function ConfigFolderLink(): React.JSX.Element {
  return (
    <button
      onClick={async () => window.api.revealPath(await window.api.opencodeConfigDir())}
      className="mt-4 block px-2 text-left text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
    >
      Open config folder
    </button>
  )
}
