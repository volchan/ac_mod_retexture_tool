import { describe, expect, it } from 'vitest'
import { isSafeRelativePath, isValidPayload, toPreviewTexture } from './previewPayload'

describe('isSafeRelativePath', () => {
  it('accepts simple relative path', () => {
    expect(isSafeRelativePath('ui/preview.png')).toBe(true)
  })

  it('rejects absolute unix path', () => {
    expect(isSafeRelativePath('/etc/passwd')).toBe(false)
  })

  it('rejects windows absolute path', () => {
    expect(isSafeRelativePath('C:\\Windows\\system32')).toBe(false)
  })

  it('rejects path traversal', () => {
    expect(isSafeRelativePath('../../etc/passwd')).toBe(false)
  })

  it('accepts nested relative path', () => {
    expect(isSafeRelativePath('textures/body/detail.dds')).toBe(true)
  })

  it('rejects path with backslash', () => {
    expect(isSafeRelativePath('textures\\body.dds')).toBe(false)
  })
})

describe('isValidPayload', () => {
  const basePayload = {
    id: 'tex1',
    name: 'body.dds',
    path: '/mods/car.kn5',
    source: 'kn5' as const,
    category: 'body',
    width: 1024,
    height: 1024,
    format: 'BC3',
  }

  it('returns true for a valid kn5 payload', () => {
    expect(isValidPayload(basePayload)).toBe(true)
  })

  it('returns false for null', () => {
    expect(isValidPayload(null)).toBe(false)
  })

  it('returns false for non-object', () => {
    expect(isValidPayload('string')).toBe(false)
  })

  it('returns false when id is missing', () => {
    expect(isValidPayload({ ...basePayload, id: '' })).toBe(false)
  })

  it('returns false when name is missing', () => {
    expect(isValidPayload({ ...basePayload, name: '' })).toBe(false)
  })

  it('returns false when source is invalid', () => {
    expect(isValidPayload({ ...basePayload, source: 'invalid' })).toBe(false)
  })

  it('returns false when width is not a number', () => {
    expect(isValidPayload({ ...basePayload, width: '1024' })).toBe(false)
  })

  it('returns true for a valid skin payload with modPath', () => {
    expect(isValidPayload({ ...basePayload, source: 'skin', modPath: '/mods/car' })).toBe(true)
  })

  it('returns false for skin payload without modPath', () => {
    expect(isValidPayload({ ...basePayload, source: 'skin' })).toBe(false)
  })

  it('returns false for preview category with unsafe path', () => {
    expect(
      isValidPayload({
        ...basePayload,
        source: 'skin',
        modPath: '/mods/track',
        category: 'preview',
        path: '../../etc/passwd',
      }),
    ).toBe(false)
  })

  it('returns true for preview category with safe relative path', () => {
    expect(
      isValidPayload({
        ...basePayload,
        source: 'skin',
        modPath: '/mods/track',
        category: 'preview',
        path: 'ui/preview.png',
      }),
    ).toBe(true)
  })
})

describe('toPreviewTexture', () => {
  it('adds previewUrl empty string and isDecoded true', () => {
    const payload = {
      id: 'tex1',
      name: 'body.dds',
      path: '/mods/car.kn5',
      source: 'kn5' as const,
      category: 'body' as const,
      width: 1024,
      height: 1024,
      format: 'BC3',
    }
    const result = toPreviewTexture(payload)
    expect(result.previewUrl).toBe('')
    expect(result.isDecoded).toBe(true)
  })

  it('passes through replacement with previewUrl defaulting to empty string', () => {
    const payload = {
      id: 'tex1',
      name: 'body.dds',
      path: '/mods/car.kn5',
      source: 'kn5' as const,
      category: 'body' as const,
      width: 1024,
      height: 1024,
      format: 'BC3',
      replacement: {
        sourcePath: '/import/body.png',
        width: 2048,
        height: 2048,
      },
    }
    const result = toPreviewTexture(payload)
    expect(result.replacement?.sourcePath).toBe('/import/body.png')
    expect(result.replacement?.previewUrl).toBe('')
  })

  it('passes through replacement previewUrl when present', () => {
    const payload = {
      id: 'tex1',
      name: 'body.dds',
      path: '/mods/car.kn5',
      source: 'kn5' as const,
      category: 'body' as const,
      width: 1024,
      height: 1024,
      format: 'BC3',
      replacement: {
        sourcePath: '/import/body.png',
        previewUrl: 'data:image/png;base64,abc',
        width: 2048,
        height: 2048,
      },
    }
    const result = toPreviewTexture(payload)
    expect(result.replacement?.previewUrl).toBe('data:image/png;base64,abc')
  })

  it('leaves replacement undefined when not provided', () => {
    const payload = {
      id: 'tex1',
      name: 'body.dds',
      path: '/mods/car.kn5',
      source: 'kn5' as const,
      category: 'body' as const,
      width: 1024,
      height: 1024,
      format: 'BC3',
    }
    const result = toPreviewTexture(payload)
    expect(result.replacement).toBeUndefined()
  })
})
