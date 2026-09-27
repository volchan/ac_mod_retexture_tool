import { beforeEach, describe, expect, it, vi } from 'vitest'
import { twoPanels } from '@/test-fixtures/mesh'
import type { BucketLayer } from '@/types/index'
import { useBucketMasks } from './useBucketMasks'
import { useCarPreview } from './useCarPreview'
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
    fillRect: vi.fn(),
    globalCompositeOperation: 'source-over',
    fillStyle: '',
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
    useCarPreview().reset()
    useCarPreview().mesh.value = twoPanels()
  })

  it('reuses the mask when nothing about the fill changed', () => {
    stubCanvas()
    const { maskFor } = useBucketMasks()
    const base = baseImage()
    const layer = bucket('a')
    expect(maskFor(layer, base)).toBe(maskFor(layer, base))
  })

  /// The flood is the cost; the colour is a repaint. Dragging the picker must
  /// not re-flood a 4K sheet on every tick.
  it('recolours the same mask rather than refilling it', () => {
    const context = stubCanvas()
    const { maskFor } = useBucketMasks()
    const base = baseImage()
    const red = maskFor(bucket('a'), base)
    context.putImageData.mockClear()

    const blue = maskFor(bucket('a', { color: '#0000ff' }), base)

    expect(blue).toBe(red)
    expect(context.putImageData).not.toHaveBeenCalled()
    expect(context.fillRect).toHaveBeenCalledTimes(1)
    expect(context.fillStyle).toBe('rgb(0 0 255)')
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

  /// The panels come from the model, so the overlay is only something to look
  /// at: hiding it once left the fill with no walls at all, running across every
  /// hole on the sheet until the app gave out.
  it('fills the same panel whether the UV overlay is shown or not', () => {
    stubCanvas()
    const { maskFor } = useBucketMasks()
    const base = baseImage()
    const hidden = maskFor(bucket('a'), base)

    useUvTemplate().image.value = baseImage()
    useUvTemplate().isEnabled.value = true

    expect(maskFor(bucket('a'), base)).toBe(hidden)
    useUvTemplate().reset()
  })

  it('waits for the model before filling a panel', () => {
    stubCanvas()
    const { maskFor } = useBucketMasks()
    const base = baseImage()
    useCarPreview().mesh.value = null

    expect(maskFor(bucket('a'), base)).toBeNull()

    useCarPreview().mesh.value = twoPanels()
    expect(maskFor(bucket('a'), base)).not.toBeNull()
  })

  /// A tint covers every painted pixel and needs no panel to stay inside of.
  it('tints the sheet without the model', () => {
    const context = stubCanvas()
    context.getImageData.mockReturnValue({
      data: new Uint8ClampedArray(4 * 4 * 4).fill(255),
      width: 4,
      height: 4,
    })
    useCarPreview().mesh.value = null

    expect(useBucketMasks().maskFor(bucket('a', { mode: 'sheet' }), baseImage())).not.toBeNull()
  })

  it('fills nothing over a hole in the atlas', () => {
    stubCanvas()

    expect(useBucketMasks().maskFor(bucket('a', { x: 2.2 }), baseImage())).toBeNull()
  })

  describe('fillBlocker', () => {
    it('lets a click on a panel through', () => {
      expect(useBucketMasks().fillBlocker({ x: 1, y: 1 }, baseImage(), 'zone')).toBeNull()
    })

    it('stops a click on a hole without a word', () => {
      expect(useBucketMasks().fillBlocker({ x: 2.2, y: 1 }, baseImage(), 'colour')).toEqual({
        kind: 'hole',
      })
    })

    it('says the model is still on its way', () => {
      useCarPreview().mesh.value = null
      useCarPreview().isLoading.value = true

      expect(useBucketMasks().fillBlocker({ x: 1, y: 1 }, baseImage(), 'zone')).toMatchObject({
        kind: 'no-model',
        reason: expect.stringContaining('Still reading'),
      })
    })

    it('passes on why the model could not be read', () => {
      useCarPreview().mesh.value = null
      useCarPreview().error.value = 'no kn5 in this folder'

      expect(useBucketMasks().fillBlocker({ x: 1, y: 1 }, baseImage(), 'zone')).toMatchObject({
        kind: 'no-model',
        reason: expect.stringContaining('no kn5 in this folder'),
      })
    })

    it('never blocks a tint', () => {
      useCarPreview().mesh.value = null

      expect(useBucketMasks().fillBlocker({ x: 1, y: 1 }, baseImage(), 'sheet')).toBeNull()
    })
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
