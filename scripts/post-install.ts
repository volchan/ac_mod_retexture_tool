import { readFileSync, writeFileSync } from 'node:fs'

try {
  const pkg = require('@biomejs/biome/package.json') as { version: string }
  const biomeConfig = JSON.parse(readFileSync('biome.json', 'utf8')) as Record<string, unknown>
  biomeConfig['$schema'] = `https://biomejs.dev/schemas/${pkg.version}/schema.json`
  writeFileSync('biome.json', `${JSON.stringify(biomeConfig, null, 2)}\n`)
} catch (e) {
  const err = e as NodeJS.ErrnoException
  if (err.code !== 'MODULE_NOT_FOUND' && err.code !== 'ENOENT') throw e
}
