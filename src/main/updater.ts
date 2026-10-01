import { execFile } from 'node:child_process'
import { app, shell } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '@shared/types'

const { autoUpdater } = electronUpdater
const RELEASES = 'https://github.com/giga-dylan/capy/releases'
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

/**
 * Updates from GitHub Releases (electron-updater). macOS only lets Developer ID–signed apps
 * replace themselves, so signed builds download and install updates; ad-hoc signed builds just
 * report a new version and link to its download.
 */
export class Updater {
  state: UpdateState = { version: app.getVersion(), status: 'idle', canInstall: false }

  constructor(private readonly onChange: (state: UpdateState) => void) {}

  async start(): Promise<void> {
    if (!app.isPackaged) return this.set({ status: 'dev' })
    const signed = await developerIdSigned()
    this.set({ canInstall: signed })
    autoUpdater.autoDownload = signed
    autoUpdater.autoInstallOnAppQuit = signed
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking', error: undefined }))
    autoUpdater.on('update-not-available', () => this.set({ status: 'up-to-date' }))
    autoUpdater.on('update-available', (info) =>
      this.set({ status: signed ? 'downloading' : 'available', latest: info.version, url: `${RELEASES}/tag/v${info.version}` })
    )
    autoUpdater.on('download-progress', (p) => this.set({ status: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (info) => this.set({ status: 'ready', latest: info.version }))
    // A private repo or no published release yet both surface here; neither is worth alarming users.
    autoUpdater.on('error', (err) => this.set({ status: 'error', error: String(err?.message ?? err).split('\n')[0] }))
    setTimeout(() => void this.check(), 10_000)
    setInterval(() => void this.check(), CHECK_EVERY_MS).unref()
  }

  async check(): Promise<void> {
    if (!app.isPackaged) return
    await autoUpdater.checkForUpdates().catch(() => undefined)
  }

  /** Signed: restart into the downloaded update. Unsigned: open the release page. */
  install(): void {
    if (this.state.status === 'ready' && this.state.canInstall) autoUpdater.quitAndInstall()
    else void shell.openExternal(this.state.url ?? RELEASES)
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.onChange(this.state)
  }
}

/** True when the running app carries a Developer ID signature (not ad-hoc). */
function developerIdSigned(): Promise<boolean> {
  const bundle = process.execPath.replace(/\/Contents\/MacOS\/[^/]+$/, '')
  return new Promise((resolve) =>
    execFile('codesign', ['-dv', '--verbose=2', bundle], (_err, _stdout, stderr) => resolve(/Authority=Developer ID Application/.test(stderr)))
  )
}
