import { useUvTemplate } from '@/composables/useUvTemplate'
import { floodFillMask, type Pixels, parseHexColor } from '@/lib/floodFill'
import type { BucketLayer } from '@/types/index'

/// Budgeted in pixels rather than entries: a fill is cropped to the panel it
/// covers, so a sheet of small ones all stay cached where a handful of
/// full-sheet fills do not. An entry limit below the layer count would evict a
/// mask the same render that rebuilt it, and re-fill every bucket every frame.
const MASK_BUDGET_PIXELS = 64_000_000

const masks = new Map<string, BucketMask>()
const basePixels = new WeakMap<HTMLImageElement, Pixels>()
const barriers = new WeakMap<HTMLImageElement, Uint8Array>()

let hovered: { key: string; mask: BucketMask } | null = null

/// A filled region as Konva draws it: the cropped bitmap, and where on the
/// texture its top-left corner belongs.
export interface BucketMask {
  canvas: HTMLCanvasElement
  x: number
  y: number
}

/// Turns a bucket layer into the bitmap Konva draws. Flood filling a 4K texture
/// costs tens of milliseconds, so results are memoised under a key built from the
/// parameters that change the shape — moving the seed or widening the tolerance
/// invalidates the entry, recolouring reuses it.
export function useBucketMasks() {
  const { image: template } = useUvTemplate()

  /// The seams are what a fill stops at, so a mask filled without them describes
  /// a different region than the same layer filled with them. Toggling the UV
  /// overlay has to miss the cache rather than redraw the pre-barrier shape.
  const walls = () => (template.value ? 'uv' : 'raw')

  function maskFor(layer: BucketLayer, base: HTMLImageElement | null): BucketMask | null {
    const key = `${maskKey(layer)}:${walls()}`
    const cached = masks.get(key)
    if (cached) return cached

    const mask = buildMask(layer, layer.tolerance, layer.color, base, template.value)
    if (!mask) return null

    masks.set(key, mask)
    evictOldest()
    return mask
  }

  /// The region the bucket would fill if the user clicked here. One slot rather
  /// than the cache: the pointer visits a new region every time it moves, and
  /// every one of those would otherwise crowd out a mask a layer still draws.
  function previewMask(
    point: { x: number; y: number },
    tolerance: number,
    color: string,
    base: HTMLImageElement | null,
  ): BucketMask | null {
    const key = `${Math.round(point.x)}:${Math.round(point.y)}:${tolerance}:${color}:${walls()}`
    if (hovered?.key === key) return hovered.mask

    const mask = buildMask(point, tolerance, color, base, template.value)
    hovered = mask ? { key, mask } : null
    return mask
  }

  function clearMasks() {
    masks.clear()
    hovered = null
  }

  return { maskFor, previewMask, clearMasks }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

function buildMask(
  seed: { x: number; y: number },
  tolerance: number,
  color: string,
  base: HTMLImageElement | null,
  template: HTMLImageElement | null,
): BucketMask | null {
  if (!base) return null

  const source = pixelsOf(base)
  if (!source) return null

  const walls = template ? barrierOf(template, source) : undefined
  const region = floodFillMask(source, seed, tolerance, parseHexColor(color), walls)
  if (region.width === 0 || region.height === 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = region.width
  canvas.height = region.height
  const context = canvas.getContext('2d')
  if (!context) return null

  const image = context.createImageData(region.width, region.height)
  image.data.set(region.data)
  context.putImageData(image, 0, 0)

  return { canvas, x: region.x, y: region.y }
}

/// The template is drawn as opaque lines on transparent pixels, so its alpha
/// channel already is the wall map the fill needs.
function barrierOf(template: HTMLImageElement, source: Pixels): Uint8Array | undefined {
  const cached = barriers.get(template)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return undefined

  context.drawImage(template, 0, 0, source.width, source.height)
  const { data } = context.getImageData(0, 0, source.width, source.height)

  const walls = new Uint8Array(source.width * source.height)
  for (let pixel = 0; pixel < walls.length; pixel += 1) {
    walls[pixel] = data[pixel * 4 + 3] > 0 ? 1 : 0
  }
  barriers.set(template, walls)
  return walls
}

/// Insertion order is eviction order: the mask untouched for longest goes first.
function evictOldest() {
  while (masks.size > 1 && cachedPixels() > MASK_BUDGET_PIXELS) {
    const oldest = masks.keys().next()
    if (oldest.done) return
    masks.delete(oldest.value)
  }
}

function cachedPixels() {
  let total = 0
  for (const mask of masks.values()) {
    total += mask.canvas.width * mask.canvas.height
  }
  return total
}

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
