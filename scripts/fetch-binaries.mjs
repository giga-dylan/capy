// Downloads/copies the runtimes we bundle into resources/bin so dev and packaged
// builds use the exact same pinned binaries. Versions live in package.json "binaries".
import { execFileSync } from 'node:child_process'
import { copyFileSync, chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const binDir = join(root, 'resources', 'bin')
const stampFile = join(binDir, '.versions.json')

if (process.platform !== 'darwin') {
  console.log('[fetch-binaries] skipping: macOS only')
  process.exit(0)
}

// Some npm setups skip dependency install scripts, leaving Electron without its binary.
if (!existsSync(join(root, 'node_modules', 'electron', 'dist'))) {
  console.log('[fetch-binaries] installing Electron binary')
  execFileSync('node', [join(root, 'node_modules', 'electron', 'install.js')], { stdio: 'inherit' })
}

// In dev the app runs inside Electron's stock bundle, so macOS shows "Electron" in the menu bar
// and Dock. Rename that bundle to the product name (packaged builds get it from electron-builder).
const devPlist = join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'Info.plist')
if (existsSync(devPlist)) {
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    execFileSync('plutil', ['-replace', key, '-string', pkg.productName, devPlist])
  }
  console.log(`[fetch-binaries] dev Electron bundle renamed to ${pkg.productName}`)
}

const wanted = JSON.stringify(pkg.binaries)
if (existsSync(stampFile) && readFileSync(stampFile, 'utf8') === wanted) {
  console.log('[fetch-binaries] up to date')
  process.exit(0)
}

rmSync(binDir, { recursive: true, force: true })
mkdirSync(join(binDir, 'ollama'), { recursive: true })

// opencode: the platform package ships a single self-contained binary.
const require = createRequire(import.meta.url)
const opencodeSrc = join(dirname(require.resolve('opencode-darwin-arm64/package.json')), 'bin', 'opencode')
copyFileSync(opencodeSrc, join(binDir, 'opencode'))
chmodSync(join(binDir, 'opencode'), 0o755)
console.log(`[fetch-binaries] opencode ${pkg.binaries.opencode}`)

// ollama: release tarball is a directory of the ollama binary plus its dylibs/metallibs.
const url = `https://github.com/ollama/ollama/releases/download/v${pkg.binaries.ollama}/ollama-darwin.tgz`
const tgz = join(binDir, 'ollama-darwin.tgz')
console.log(`[fetch-binaries] downloading ${url}`)
execFileSync('curl', ['-fL', '--progress-bar', '-o', tgz, url], { stdio: 'inherit' })
execFileSync('tar', ['xzf', tgz, '-C', join(binDir, 'ollama')], { stdio: 'inherit' })
rmSync(tgz)
// Drop x86-only CPU backends; we only ship arm64.
execFileSync('sh', ['-c', `rm -f "${join(binDir, 'ollama')}"/libggml-cpu-*.so`])
console.log(`[fetch-binaries] ollama ${pkg.binaries.ollama}`)

writeFileSync(stampFile, wanted)
