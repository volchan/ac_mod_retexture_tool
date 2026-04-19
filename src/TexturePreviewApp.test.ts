import { describe, expect, it } from 'vitest'
import { isSafeRelativePath, isValidPayload } from '@/lib/previewPayload'

const base = {
  id: 'tex1',
  name: 'body.dds',
  path: '/mods/car.kn5',
  source: 'kn5',
  width: 1024,
  height: 1024,
  format: 'BC3',
  category: 'body',
}

describe('isSafeRelativePath', () => {
  it('accepts a normal relative path', () => {
    expect(isSafeRelativePath('ui/boot/preview.png')).toBe(true)
  })

  it('rejects absolute Unix paths', () => {
    expect(isSafeRelativePath('/etc/passwd')).toBe(false)
  })

  it('rejects Windows drive paths with forward slash', () => {
    expect(isSafeRelativePath('C:/file.png')).toBe(false)
  })

  it('rejects Windows drive paths with backslash', () => {
    expect(isSafeRelativePath('C:\\Windows\\win.ini')).toBe(false)
  })

  it('rejects UNC paths with backslashes', () => {
    expect(isSafeRelativePath('\\\\server\\share\\file')).toBe(false)
  })

  it('rejects backslash traversal', () => {
    expect(isSafeRelativePath('..\\..\\secret')).toBe(false)
  })

  it('rejects paths with .. traversal', () => {
    expect(isSafeRelativePath('../../etc/passwd')).toBe(false)
  })

  it('rejects paths with embedded ..', () => {
    expect(isSafeRelativePath('ui/../../../etc/passwd')).toBe(false)
  })
})

describe('isValidPayload', () => {
  it('accepts a valid kn5 payload', () => {
    expect(isValidPayload(base)).toBe(true)
  })

  it('accepts a valid skin payload with modPath', () => {
    expect(isValidPayload({ ...base, source: 'skin', modPath: '/mods/car' })).toBe(true)
  })

  it('rejects skin payload without modPath', () => {
    expect(isValidPayload({ ...base, source: 'skin' })).toBe(false)
  })

  it('rejects preview payload with absolute path', () => {
    expect(
      isValidPayload({
        ...base,
        source: 'skin',
        category: 'preview',
        path: '/etc/passwd',
        modPath: '/mods/car',
      }),
    ).toBe(false)
  })

  it('rejects preview payload with traversal in path', () => {
    expect(
      isValidPayload({
        ...base,
        source: 'skin',
        category: 'preview',
        path: '../../etc/passwd',
        modPath: '/mods/car',
      }),
    ).toBe(false)
  })

  it('accepts preview payload with safe relative path', () => {
    expect(
      isValidPayload({
        ...base,
        source: 'skin',
        category: 'preview',
        path: 'ui/boot/preview.png',
        modPath: '/mods/spa',
      }),
    ).toBe(true)
  })

  it('rejects empty id', () => {
    expect(isValidPayload({ ...base, id: '' })).toBe(false)
  })

  it('rejects unknown source', () => {
    expect(isValidPayload({ ...base, source: 'unknown' })).toBe(false)
  })

  it('rejects null', () => {
    expect(isValidPayload(null)).toBe(false)
  })
})
