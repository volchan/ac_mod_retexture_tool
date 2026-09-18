import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BucketLayer } from '@/types/index'
import { useBucketMasks } from './useBucketMasks'
import { useUvTemplate } from './useUvTemplate'

function bucket(id: string, over: Partial<BucketLayer> = {}): BucketLayer {
  return {
    id,
    name: 'Fill',
    visible: true,
    opacity: 1,
    type: 'bucket',
    x: 1,
    y: 1,
    tolerance: 32,
    color: '#ff0000',
    blend: 'source-over',
    ...over,
  }
}

/// jsdom has no canvas, so the drawing calls are stubbed down to what the cache
/// actually needs: a context that hands back pixel data and swallows the writes.
function stubCanvas() {
  const pixels = { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 }
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => pixels),
    createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4 * 4 * 4) })),
    putImageData: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  return context
}

function baseImage() {
  const img = new Image()
  Object.defineProperty(img, 'naturalWidth', { value: 4 })
  Object.defineProperty(img, 'naturalHeight', { value: 4 })
  return img
}

describe('useBucketMasks', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useBucketMasks().clearMasks()
    useUvTemplate().image.value = null
  })

  it('reuses the mask when nothing about the fill changed', () => {
    stubCanvas()
    const { maskFor } = useBucketMasks()
    const base = baseImage()
    const layer = bucket('a')
    expect(maskFor(layer, base)).toBe(maskFor(layer, base))
  })

  it('recomputes when the seed moves', () => {
    stubCanvas()
    const { maskFor } = useBucketMasks()
    const base = baseImage()
    const first = maskFor(bucket('a'), base)
    expect(maskFor(bucket('a', { x: 3 }), base)).not.toBe(first)
  })

  it('has nothing to draw without a base texture', () => {
    expect(useBucketMasks().maskFor(bucket('a'), null)).toBeNull()
  })

  it('drops every mask when the editor clears them', () => {
    stubCanvas()
    const { maskFor, clearMasks } = useBucketMasks()
    const base = baseImage()
    const first = maskFor(bucket('a'), base)
    clearMasks()
    expect(maskFor(bucket('a'), base)).not.toBe(first)
  })

  /// An entry cap below the layer count evicted a mask the same render that
  /// built it, so every bucket re-ran its flood fill on every frame.
  it('keeps every mask that fits, however many layers there are', () => {
    stubCanvas()
    const { maskFor } = useBucketMasks()
    const base = baseImage()
    const first = maskFor(bucket('layer-0'), base)
    for (let i = 1; i <= 20; i += 1) {
      maskFor(bucket(`layer-${i}`), base)
    }
    expect(maskFor(bucket('layer-0'), base)).toBe(first)
  })

  it('reuses the hover preview while the pointer sits on the same spot', () => {
    stubCanvas()
    const { previewMask } = useBucketMasks()
    const base = baseImage()
    const first = previewMask({ x: 1, y: 1 }, 32, '#ff0000', base)
    expect(previewMask({ x: 1, y: 1 }, 32, '#ff0000', base)).toBe(first)
  })

  it('recomputes the hover preview once the pointer moves elsewhere', () => {
    stubCanvas()
    const { previewMask } = useBucketMasks()
    const base = baseImage()
    const first = previewMask({ x: 1, y: 1 }, 32, '#ff0000', base)
    expect(previewMask({ x: 3, y: 3 }, 32, '#ff0000', base)).not.toBe(first)
  })

  /// The pointer visits a new region every time it moves, so a preview that went
  /// through the cache would evict the masks the layers are still drawing.
  it('keeps hover previews out of the layer cache', () => {
    stubCanvas()
    const { maskFor, previewMask } = useBucketMasks()
    const base = baseImage()
    const layer = maskFor(bucket('a'), base)
    for (let i = 0; i < 30; i += 1) {
      previewMask({ x: i, y: i }, 32, '#ff0000', base)
    }
    expect(maskFor(bucket('a'), base)).toBe(layer)
  })

  /// The seams are what the fill stops at, so a mask filled without them covers
  /// a different region than the same layer filled with them.
  it('refills when the UV seams are switched on', () => {
    stubCanvas()
    const { maskFor } = useBucketMasks()
    const base = baseImage()
    const flat = maskFor(bucket('a'), base)

    useUvTemplate().image.value = baseImage()
    expect(maskFor(bucket('a'), base)).not.toBe(flat)

    useUvTemplate().image.value = null
    expect(maskFor(bucket('a'), base)).toBe(flat)
  })

  it('refills the hover preview when the UV seams are switched on', () => {
    stubCanvas()
    const { previewMask } = useBucketMasks()
    const base = baseImage()
    const flat = previewMask({ x: 1, y: 1 }, 32, '#ff0000', base)

    useUvTemplate().image.value = baseImage()
    expect(previewMask({ x: 1, y: 1 }, 32, '#ff0000', base)).not.toBe(flat)
  })

  it('has no hover preview without a base texture', () => {
    expect(useBucketMasks().previewMask({ x: 1, y: 1 }, 32, '#ff0000', null)).toBeNull()
  })

  it('places the mask where the fill spread, not where the click landed', () => {
    stubCanvas()
    const mask = useBucketMasks().maskFor(bucket('a', { x: 3, y: 3 }), baseImage())
    expect(mask).toMatchObject({ x: 0, y: 0 })
  })
})
