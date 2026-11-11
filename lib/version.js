import { readFileSync } from 'node:fs'

// Single source of truth for the versions this plugin reports.
//
// The plugin used to hardcode '1.0.4', which is the bundled CodeBuddy CLI
// channel version rather than this package's own version (dsh-dkn-agent). Logs
// therefore could never be matched against the running build. Keep the two
// concepts separate: the package version identifies this code, the bundled
// channel version identifies the CLI transport it wraps.
let manifest = {}
try { manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) } catch {}
const text = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim() : fallback

// Version of this DSH plugin package (dsh-dkn-agent).
export const pluginVersion = text(manifest.version, '0.0.0')

// Version of the bundled CodeBuddy CLI channel, reported separately and never
// substituted for the package version.
export const bundledCodeBuddyVersion = text(manifest.bundledCodeBuddyVersion, '')
