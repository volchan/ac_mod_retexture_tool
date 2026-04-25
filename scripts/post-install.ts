import { readFileSync, writeFileSync } from 'node:fs'

try {
  const pkg = require('@biomejs/biome/package.json') as { version: string }
  const content = readFileSync('biome.json', 'utf8')
  const updated = content.replace(
    /"\\$schema":\s*"[^"]*"/,
    `"$schema": "https://biomejs.dev/schemas/${pkg.version}/schema.json"`,
  )
  writeFileSync('biome.json', updated)
} catch (e) {
  const err = e as NodeJS.ErrnoException
  if (err.code !== 'MODULE_NOT_FOUND' && err.code !== 'ENOENT') throw e
}
