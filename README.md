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

Everything is configurable in the app (sidebar → **Settings**) and saved to
`~/Library/Application Support/Capy/settings.json`:

- **Models**: install from a recommended list or any `ollama.com/library` tag, import an MLX/safetensors
  folder (e.g. from LM Studio) or a `.gguf` file, set the active model, delete models. The chat box also
  has a model picker. Models without tool support are flagged (they can't run agent tools).
- **Model storage**: Ollama's model folder (`OLLAMA_MODELS`); default `~/.ollama/models`.
- **Agent permissions**: ask / allow / deny for file edits, shell commands, web fetches, and access
  outside the chat's folder.
- **Limits**: context window and max output tokens.
- **Advanced**: a JSON object deep-merged over the generated opencode config (see
  [opencode.ai/docs/config](https://opencode.ai/docs/config/)), plus a view of the final config.

Saving restarts opencode (and Ollama when storage or context changes); switching the active model doesn't.
The generated config always pins opencode to the bundled Ollama (`enabled_providers: ["ollama"]`), so
titles and summaries never go to a cloud provider.

## Release

```sh
npm run dist     # signed + notarized arm64 DMG/zip in dist/
```

Needs a Developer ID certificate and `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` env vars.
