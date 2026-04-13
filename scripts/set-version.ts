import { readFileSync, writeFileSync } from 'node:fs'

const tag = process.argv[2]
if (!tag) {
  console.error('Usage: bun scripts/set-version.ts <tag>')
  process.exit(1)
}

const version = tag.replace(/^v/, '')

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version "${version}" derived from tag "${tag}". Expected semver X.Y.Z.`)
  process.exit(1)
}

const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf-8'))
conf.version = version
writeFileSync('src-tauri/tauri.conf.json', `${JSON.stringify(conf, null, 2)}\n`)

const cargo = readFileSync('src-tauri/Cargo.toml', 'utf-8')
const cargoVersionPattern = /^version = ".*"/m
if (!cargoVersionPattern.test(cargo)) {
  console.error('Failed to update src-tauri/Cargo.toml: could not find a matching version line')
  process.exit(1)
}
writeFileSync('src-tauri/Cargo.toml', cargo.replace(cargoVersionPattern, `version = "${version}"`))

console.log(`Version set to ${version}`)
