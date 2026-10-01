import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Workspace for chats with no project folder. opencode needs a directory for every session. */
export function chatsDirectory(): string {
  const dir = join(app.getPath('userData'), 'chats')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Project folders the user has added, persisted to projects.json (most recent first). */
export class ProjectStore {
  private readonly file = join(app.getPath('userData'), 'projects.json')

  list(): string[] {
    return existsSync(this.file) ? (JSON.parse(readFileSync(this.file, 'utf8')) as string[]) : []
  }

  add(directory: string): void {
    this.save([directory, ...this.list().filter((d) => d !== directory)])
  }

  remove(directory: string): void {
    this.save(this.list().filter((d) => d !== directory))
  }

  private save(dirs: string[]): void {
    writeFileSync(this.file, JSON.stringify(dirs, null, 2))
  }
}
