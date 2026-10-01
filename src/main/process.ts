import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { createServer } from 'node:net'

/** Ask the OS for a free localhost port so we never clash with a user's own Ollama/opencode. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number }
      srv.close(() => resolve(port))
    })
  })
}

export function spawnService(name: string, cmd: string, args: string[], opts: SpawnOptions): ChildProcess {
  const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts })
  const log = (chunk: Buffer): void => {
    for (const line of chunk.toString().split('\n')) if (line.trim()) console.log(`[${name}] ${line}`)
  }
  proc.stdout?.on('data', log)
  proc.stderr?.on('data', log)
  return proc
}

export async function waitFor(check: () => Promise<boolean>, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`${label} did not become ready within ${timeoutMs}ms`)
}

/** SIGTERM, then SIGKILL after 3s. Resolves once the process has exited. */
export function stopProcess(proc: ChildProcess | undefined): Promise<void> {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve()
  const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()))
  proc.kill('SIGTERM')
  setTimeout(() => proc.exitCode === null && proc.signalCode === null && proc.kill('SIGKILL'), 3000).unref()
  return exited
}
