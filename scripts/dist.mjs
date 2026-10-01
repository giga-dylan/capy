// Builds the macOS installer (dmg + zip). Signs with a Developer ID certificate when one is
// available (Keychain, or CSC_LINK in CI) and notarizes when APPLE_* credentials are set.
// Without a certificate the app is ad-hoc signed: it runs, but Gatekeeper asks users to
// approve it once (System Settings → Privacy & Security → Open Anyway) and it can't self-update.
// Extra arguments are passed to electron-builder (e.g. --publish always).
import { execFileSync, spawnSync } from 'node:child_process'

const hasKeychainCert = (() => {
  try {
    return execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' }).includes('Developer ID Application')
  } catch {
    return false
  }
})()
const signed = hasKeychainCert || !!process.env.CSC_LINK

const args = ['electron-builder', '--mac', '--arm64', ...process.argv.slice(2)]
if (!signed) {
  console.warn('[dist] No Developer ID certificate found: building an ad-hoc signed app (not notarized).')
  args.push('-c.mac.identity=-', '-c.mac.notarize=false')
} else if (!process.env.APPLE_ID) {
  console.warn('[dist] Signing with Developer ID, but APPLE_ID is not set: skipping notarization.')
}

const run = (cmd, a) => {
  const r = spawnSync(cmd, a, { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
run('npm', ['run', 'build'])
run('npx', args)
