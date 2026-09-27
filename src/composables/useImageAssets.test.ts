import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/tauri', () => ({ loadReplacementFull: vi.fn() }))

import { loadReplacementFull } from '@/lib/tauri'
import { useImageAssets } from './useImageAssets'

class StubImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 128
  naturalHeight = 64
  set src(value: string) {
    queueMicrotask(() => (value === 'data:broken' ? this.onerror?.() : this.onload?.()))
  }
}

describe('useImageAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('Image', StubImage)
    vi.mocked(loadReplacementFull).mockResolvedValue('data:image/png;base64,AAA')
  })

  it('reads a path through the backend, since the webview cannot open files', async () => {
    const img = await useImageAssets().load('/tmp/a.png')
    expect(loadReplacementFull).toHaveBeenCalledWith('/tmp/a.png')
    expect(img?.naturalWidth).toBe(128)
  })

  it('uses a data URL as-is', async () => {
    await useImageAssets().load('data:image/png;base64,ZZZ')
    expect(loadReplacementFull).not.toHaveBeenCalled()
  })

  it('returns null on a miss and serves the bitmap once loaded', async () => {
    const assets = useImageAssets()
    expect(assets.resolve('/tmp/b.png')).toBeNull()
    await assets.load('/tmp/b.png')
    expect(assets.resolve('/tmp/b.png')).not.toBeNull()
  })

  it('reads a given path only once, however many layers use it', async () => {
    const assets = useImageAssets()
    await Promise.all([assets.load('/tmp/c.png'), assets.load('/tmp/c.png')])
    await assets.load('/tmp/c.png')
    expect(loadReplacementFull).toHaveBeenCalledTimes(1)
  })

  it('survives a file that cannot be read', async () => {
    vi.mocked(loadReplacementFull).mockRejectedValueOnce(new Error('gone'))
    expect(await useImageAssets().load('/tmp/missing.png')).toBeNull()
  })

  it('survives a file that is not a decodable image', async () => {
    vi.mocked(loadReplacementFull).mockResolvedValueOnce('data:broken')
    expect(await useImageAssets().load('/tmp/corrupt.png')).toBeNull()
  })
})
