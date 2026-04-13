import { readFileSync, writeFileSync } from 'node:fs'

const tag = process.argv[2]
if (!tag) {
  console.error('Usage: bun scripts/set-version.ts <tag>')
  process.exit(1)
}

const version = tag.replace(/^v/, '')

const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf-8'))
conf.version = version
writeFileSync('src-tauri/tauri.conf.json', `${JSON.stringify(conf, null, 2)}\n`)

const cargo = readFileSync('src-tauri/Cargo.toml', 'utf-8')
writeFileSync('src-tauri/Cargo.toml', cargo.replace(/^version = ".*"/m, `version = "${version}"`))

console.log(`Version set to ${version}`)
