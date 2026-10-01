import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { InstalledModel, ModelProgress } from '@shared/types'
import { binDir } from './config'
import { freePort, spawnService, stopProcess, waitFor } from './process'

export interface OllamaOptions {
  /** OLLAMA_MODELS; undefined = ~/.ollama/models, shared with any existing Ollama install. */
  modelsDir?: string
  contextLength: number
}

/** Runs the bundled Ollama server on a private port and manages its models. */
export class OllamaRuntime {
  private proc?: ChildProcess
  private options?: OllamaOptions
  baseUrl = ''

  private get bin(): string {
    return join(binDir(), 'ollama', 'ollama')
  }

  private env(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      OLLAMA_HOST: this.baseUrl.replace('http://', ''),
      ...(this.options?.modelsDir && { OLLAMA_MODELS: this.options.modelsDir })
    }
  }

  async start(options: OllamaOptions): Promise<void> {
    this.options = options
    this.baseUrl = `http://127.0.0.1:${await freePort()}`
    this.proc = spawnService('ollama', this.bin, ['serve'], {
      env: {
        ...this.env(),
        OLLAMA_CONTEXT_LENGTH: String(options.contextLength),
        OLLAMA_KEEP_ALIVE: '30m',
        OLLAMA_FLASH_ATTENTION: '1'
      }
    })
    await waitFor(async () => (await fetch(`${this.baseUrl}/api/version`)).ok, 20_000, 'Ollama')
  }

  async restart(options: OllamaOptions): Promise<void> {
    await stopProcess(this.proc)
    await this.start(options)
  }

  async listModels(): Promise<InstalledModel[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`)
    const { models } = (await res.json()) as {
      models: { name: string; size: number; details: { format: string; quantization_level: string }; capabilities?: string[] }[]
    }
    return models
      .map((m) => ({
        name: m.name,
        size: m.size,
        format: m.details.format,
        quantization: m.details.quantization_level,
        capabilities: m.capabilities ?? []
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Streams /api/pull (newline-delimited JSON) and reports progress. */
  async pull(model: string, onProgress: (p: ModelProgress) => void): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/pull`, { method: 'POST', body: JSON.stringify({ model, stream: true }) })
    if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`)
    const decoder = new TextDecoder()
    let buf = ''
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const msg = JSON.parse(line) as { status: string; completed?: number; total?: number; error?: string }
        if (msg.error) throw new Error(msg.error)
        onProgress({ model, status: msg.status, completed: msg.completed, total: msg.total })
      }
    }
  }

  /**
   * Imports a local model (a safetensors/MLX folder or a .gguf file) with `ollama create`.
   * The CLI imports safetensors itself and writes to OLLAMA_MODELS, so it must get the
   * same env as the server.
   */
  async import(source: string, model: string, onProgress: (p: ModelProgress) => void): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'capy-import-'))
    const modelfile = join(dir, 'Modelfile')
    writeFileSync(modelfile, `FROM ${JSON.stringify(source)}\n`)
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(this.bin, ['create', model, '-f', modelfile], { env: this.env() })
        let lastLine = ''
        const onData = (chunk: Buffer): void => {
          // Strip the CLI's terminal control codes and spinner, and report the latest line.
          const text = chunk.toString().replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
          const line = text
            .split(/[\r\n]/)
            .map((l) => l.replace(/[⠀-⣿]/g, '').trim())
            .filter(Boolean)
            .pop()
          if (line) {
            lastLine = line
            onProgress({ model, status: line })
          }
        }
        proc.stdout.on('data', onData)
        proc.stderr.on('data', onData)
        proc.on('error', reject)
        proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(lastLine || `ollama create exited with ${code}`))))
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  async delete(model: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/delete`, { method: 'DELETE', body: JSON.stringify({ model }) })
    if (!res.ok) throw new Error(`Delete failed: ${await res.text()}`)
  }

  stop(): void {
    void stopProcess(this.proc)
  }
}
