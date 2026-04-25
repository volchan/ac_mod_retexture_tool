import { beforeEach, describe, expect, it } from 'vitest'
import { useGlobalCommands } from './useGlobalCommands'

beforeEach(() => {
  const { extractTick, importPath, importTick, queueTick } = useGlobalCommands()
  extractTick.value = 0
  importPath.value = null
  importTick.value = 0
  queueTick.value = 0
})

describe('useGlobalCommands', () => {
  it('returns extractTick starting at 0', () => {
    const { extractTick } = useGlobalCommands()
    expect(extractTick.value).toBeGreaterThanOrEqual(0)
  })

  it('triggerExtract increments extractTick', () => {
    const { extractTick, triggerExtract } = useGlobalCommands()
    const before = extractTick.value
    triggerExtract()
    expect(extractTick.value).toBe(before + 1)
  })

  it('triggerExtract increments on each call', () => {
    const { extractTick, triggerExtract } = useGlobalCommands()
    const before = extractTick.value
    triggerExtract()
    triggerExtract()
    expect(extractTick.value).toBe(before + 2)
  })

  it('importPath starts as null', () => {
    const { importPath } = useGlobalCommands()
    expect(importPath.value).toBeNull()
  })

  it('triggerImport sets importPath and bumps importTick', () => {
    const { importPath, importTick, triggerImport } = useGlobalCommands()
    const before = importTick.value
    triggerImport('/some/folder')
    expect(importPath.value).toBe('/some/folder')
    expect(importTick.value).toBe(before + 1)
  })

  it('triggerImport re-triggers when called with same path', () => {
    const { importTick, triggerImport } = useGlobalCommands()
    const before = importTick.value
    triggerImport('/same')
    triggerImport('/same')
    expect(importTick.value).toBe(before + 2)
  })

  it('triggerImport overwrites previous path', () => {
    const { importPath, triggerImport } = useGlobalCommands()
    triggerImport('/first')
    triggerImport('/second')
    expect(importPath.value).toBe('/second')
  })

  it('queueTick starts at 0', () => {
    const { queueTick } = useGlobalCommands()
    expect(queueTick.value).toBe(0)
  })

  it('triggerQueue increments queueTick', () => {
    const { queueTick, triggerQueue } = useGlobalCommands()
    triggerQueue()
    expect(queueTick.value).toBe(1)
  })

  it('all calls share the same reactive state', () => {
    const a = useGlobalCommands()
    const b = useGlobalCommands()
    const before = a.extractTick.value
    a.triggerExtract()
    expect(b.extractTick.value).toBe(before + 1)
  })
})
