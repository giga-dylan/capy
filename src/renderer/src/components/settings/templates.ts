// Starter files for new opencode extensions. Formats follow opencode.ai/docs (agents, commands,
// skills, plugins, custom-tools).

export const agentTemplate = (name: string): string => `---
description: Reviews code for bugs and readability without changing files
mode: subagent
# primary = selectable in the chat's agent picker; subagent = called by other agents or @${name}
# model: ollama/qwen3.8:27b-mlx
temperature: 0.1
permission:
  edit: deny
  bash: deny
---

You are a careful code reviewer. Point out bugs, risky edge cases and unclear code.
Be specific: quote the line and explain the fix.
`

export const commandTemplate = (name: string): string => `---
description: Write tests for a file
# agent: build
# subtask: true
---

Write focused unit tests for @$1.
Match the project's existing test style. Extra instructions: $ARGUMENTS
`

export const commandHelp = 'Run it in chat with /NAME args. Placeholders: $ARGUMENTS (all args), $1 $2 … (positional), @file (include a file), !`cmd` (shell output).'

export const skillTemplate = (name: string): string => `---
name: ${name}
description: Explain when the agent should use this skill, in one or two sentences. The agent sees this description and decides whether to load the skill.
---

# ${name}

Step-by-step instructions the agent follows when it loads this skill.

1. …
2. …
`

export const pluginTemplate = (): string => `/**
 * opencode plugin: hooks into the agent's lifecycle.
 * Docs: https://opencode.ai/docs/plugins/
 *
 * Context: { project, client, $, directory, worktree }
 *   client = opencode SDK client, $ = Bun shell
 */
export const MyPlugin = async ({ client, $ }) => {
  return {
    // Runs before every tool call. Throw to block it.
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read" && String(output.args.filePath).includes(".env")) {
        throw new Error("Reading .env files is not allowed")
      }
    },

    // Runs after every tool call.
    "tool.execute.after": async (input, output) => {},

    // Every event: session.idle, session.error, file.edited, permission.asked, message.updated, ...
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await $\`osascript -e 'display notification "Agent finished" with title "Capy"'\`
      }
    },
  }
}
`

export const toolTemplate = (): string => `/**
 * Custom tool: the agent can call it like a built-in tool. The file name is the tool name.
 * Docs: https://opencode.ai/docs/custom-tools/
 */
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Returns the current date and time",
  args: {
    timezone: tool.schema.string().describe("IANA timezone, e.g. America/Los_Angeles").optional(),
  },
  async execute(args) {
    return new Date().toLocaleString("en-US", { timeZone: args.timezone })
  },
})
`
