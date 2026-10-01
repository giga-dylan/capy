# Capy

Desktop app for running coding agents on local LLMs. macOS / Apple Silicon only, 32 GB RAM minimum.

- **Agent engine:** [opencode](https://opencode.ai) (bundled binary, driven over HTTP via `@opencode-ai/sdk`)
- **Model server:** [Ollama](https://ollama.com) (bundled, MLX engine)
- **Default model:** `qwen3.8:27b-mlx` (~18 GB)

## Develop

```sh
npm install      # also downloads the pinned Ollama + opencode binaries into resources/bin
npm run dev
```

Pinned runtime versions live in `package.json` → `"binaries"`. Bump them there (and the matching
`@opencode-ai/sdk` / `opencode-darwin-arm64` versions), then run `npm run fetch-binaries`.

## How it works

```
Electron main
 ├─ OllamaRuntime   (src/main/ollama.ts)    ollama serve on a random localhost port, 32K context
 ├─ OpencodeRuntime (src/main/opencode.ts)  opencode serve on a random port, per-launch password,
 │                                          private data dir, provider → bundled Ollama
 └─ IPC             (src/main/index.ts)     sessions, prompts, abort, permission replies, event stream
Renderer (React + Tailwind)
 └─ Setup (runtime status, model download) → Workspace (folder picker) → Chat (stream, tools, approvals)
```

- Models are stored in `~/.ollama/models` by default, shared with any Ollama install the user already has.
- opencode's data lives in `~/Library/Application Support/Capy/opencode`, isolated from a user's own opencode.
- File edits, shell commands and web fetches require approval in the UI.

## Settings

Sidebar → **Settings** surfaces everything opencode supports:

| Tab | What it edits |
|---|---|
| Models & general | Install/import/delete/switch models, title/summary model (`small_model`), model folder, context + output limits |
| Permissions | All opencode permission keys (ask/allow/deny) with per-pattern rules |
| Rules | Global `AGENTS.md`, extra instruction files/URLs, Claude Code `CLAUDE.md` toggle |
| Agents | Built-in + custom agents, default agent, disable built-ins, per-agent overrides (model, thinking, temperature, top_p, steps, prompt, permissions), subagent depth, `agents/*.md` editor |
| Commands | All commands, `commands/*.md` editor (run in chat as `/name args`) |
| Skills | Loaded skills by source, `skills/<name>/SKILL.md` editor, extra skill folders/URLs, Claude Code skills toggle |
| MCP servers | Add/edit local or remote servers (env/headers, cwd, timeout, OAuth) with live status |
| Plugins & hooks | `plugins/*.ts` editor (hook template) and npm plugins |
| Tools | Enable/disable each tool, `tools/*.ts` custom tools editor |
| Formatters & LSP | Turn formatters/language servers on (off by default in opencode), per-tool toggles, custom ones |
| Advanced | Compaction, tool output limits, image limits, snapshots, shell, username, log level, watcher ignores, experimental flags, references, managed keys, the full JSON layer, and the final config |

How it's stored:

- `~/Library/Application Support/Capy/settings.json`: app settings plus `opencode`, a JSON layer deep-merged
  over the config Capy generates. Every structured screen edits this one object.
- `~/Library/Application Support/Capy/opencode/config/opencode/`: opencode's global config folder for Capy
  (`AGENTS.md`, `agents/`, `commands/`, `skills/`, `plugins/`, `tools/`). Projects can add their own
  `AGENTS.md` and `.opencode/` folders as usual.
- Claude Code compatibility (`~/.claude/skills`, `CLAUDE.md`) is **off by default** so Capy only uses what's
  configured in Capy and prompts stay small for local models.

Thinking levels come from Ollama per model (`/api/show`), so only levels a model actually supports are offered.

Saving restarts opencode (and Ollama when storage or context changes); switching the model or agent doesn't.
The generated config always pins opencode to the bundled Ollama (`enabled_providers: ["ollama"]`).

## Release

```sh
npm run dist     # signed + notarized arm64 DMG/zip in dist/
```

Needs a Developer ID certificate and `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` env vars.
