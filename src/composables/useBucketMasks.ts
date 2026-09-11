import { floodFillMask, type Pixels, parseHexColor } from '@/lib/floodFill'
import type { BucketLayer } from '@/types/index'

const masks = new Map<string, HTMLCanvasElement>()
const basePixels = new WeakMap<HTMLImageElement, Pixels>()

/// Turns a bucket layer into the bitmap Konva draws. Flood filling a 4K texture
/// costs tens of milliseconds, so results are memoised under a key built from the
/// parameters that change the shape — moving the seed or widening the tolerance
/// invalidates the entry, recolouring reuses it.
export function useBucketMasks() {
  function maskFor(layer: BucketLayer, base: HTMLImageElement | null): HTMLCanvasElement | null {
    if (!base) return null

    const key = maskKey(layer)
    const cached = masks.get(key)
    if (cached) return cached

    const source = pixelsOf(base)
    if (!source) return null

    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const context = canvas.getContext('2d')
    if (!context) return null

    const image = context.createImageData(source.width, source.height)
    image.data.set(floodFillMask(source, layer, layer.tolerance, parseHexColor(layer.color)))
    context.putImageData(image, 0, 0)

    masks.set(key, canvas)
    return canvas
  }

  return { maskFor }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

function maskKey(layer: BucketLayer) {
  return `${layer.id}:${Math.round(layer.x)}:${Math.round(layer.y)}:${layer.tolerance}:${layer.color}`
}

/// Reading a texture back costs a full draw, so each base image is sampled once
/// and every bucket on it shares the result.
function pixelsOf(base: HTMLImageElement): Pixels | null {
  const cached = basePixels.get(base)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = base.naturalWidth
  canvas.height = base.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || canvas.width === 0 || canvas.height === 0) return null

  context.drawImage(base, 0, 0)
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const pixels: Pixels = { data: image.data, width: canvas.width, height: canvas.height }
  basePixels.set(base, pixels)
  return pixels
}
