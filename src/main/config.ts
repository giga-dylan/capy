import { app } from 'electron'
import { join } from 'node:path'

/** Bundled runtimes: resources/bin in dev, Contents/Resources/bin when packaged. */
export function binDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'bin') : join(app.getAppPath(), 'resources', 'bin')
}
