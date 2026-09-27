import { useCarPreview } from '@/composables/useCarPreview'
import {
  type FillMode,
  type FillRegion,
  floodFillMask,
  islandRegion,
  type Pixels,
  paintedMask,
  parseHexColor,
} from '@/lib/floodFill'
import {
  type IslandMask,
  islandAt,
  islandMask,
  type UvGeometry,
  uvGeometryOf,
} from '@/lib/uvIslands'
import type { BucketLayer, CarMeshData } from '@/types/index'

/// Budgeted in pixels rather than entries: a fill is cropped to the panel it
/// covers, so a sheet of small ones all stay cached where a handful of
/// full-sheet fills do not. An entry limit below the layer count would evict a
/// mask the same render that rebuilt it, and re-fill every bucket every frame.
const MASK_BUDGET_PIXELS = 64_000_000

const masks = new Map<string, CachedMask>()
const basePixels = new WeakMap<HTMLImageElement, Pixels>()
const geometries = new WeakMap<CarMeshData, UvGeometry>()
const islandMasks = new WeakMap<UvGeometry, Map<string, IslandMask>>()

let hovered: { key: string; mask: CachedMask } | null = null

/// A filled region as Konva draws it: the cropped bitmap, and where on the
/// texture its top-left corner belongs.
export interface BucketMask {
  canvas: HTMLCanvasElement
  x: number
  y: number
}

/// A click on a hole in the atlas fills nothing and says nothing: the preview
/// already showed nothing there. A missing model is worth saying out loud.
export type FillBlocker = { kind: 'hole' } | { kind: 'no-model'; reason: string }

/// What the cache holds: the mask plus the colour it is painted in, so a
/// recolour is told apart from a refill.
interface CachedMask extends BucketMask {
  color: string
}

/// Turns a bucket layer into the bitmap Konva draws. Flood filling a 4K texture
/// costs tens of milliseconds, so results are memoised under a key built from the
/// parameters that change the shape — moving the seed or widening the tolerance
/// invalidates the entry, recolouring reuses it.
export function useBucketMasks() {
  const { mesh, isLoading, error } = useCarPreview()

  /// The panels a fill spreads across, once the model has been read. Read
  /// inside the render, so a fill aimed before it arrived draws once it does.
  const geometry = () => (mesh.value ? geometryOf(mesh.value) : null)

  /// Why a click here would fill nothing, or null when it would fill something.
  function fillBlocker(
    point: { x: number; y: number },
    base: HTMLImageElement | null,
    mode: FillMode,
  ): FillBlocker | null {
    if (mode === 'sheet' || !base) return null
    const panels = geometry()
    if (!panels) {
      const reason = isLoading.value
        ? 'Still reading the car’s panels — try again in a moment'
        : `The bucket needs the car’s panels: ${error.value ?? 'the model is not loaded'}`
      return { kind: 'no-model', reason }
    }
    const island = islandAt(panels, point.x / base.naturalWidth, point.y / base.naturalHeight)
    return island === null ? { kind: 'hole' } : null
  }

  function maskFor(layer: BucketLayer, base: HTMLImageElement | null): BucketMask | null {
    const panels = geometry()
    const key = maskKey(layer)
    const cached = masks.get(key)
    if (cached) return tinted(cached, layer.color)

    const mask = buildMask(layer, layer.tolerance, layer.color, base, panels, layer.mode)
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
    mode: FillMode = 'colour',
  ): BucketMask | null {
    const panels = geometry()
    const key = `${Math.round(point.x)}:${Math.round(point.y)}:${tolerance}:${mode}:${panels ? 'panels' : 'none'}`
    if (hovered?.key === key) return tinted(hovered.mask, color)

    const mask = buildMask(point, tolerance, color, base, panels, mode)
    hovered = mask ? { key, mask } : null
    return mask
  }

  function clearMasks() {
    masks.clear()
    hovered = null
  }

  return { maskFor, previewMask, clearMasks, fillBlocker }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

function buildMask(
  seed: { x: number; y: number },
  tolerance: number,
  color: string,
  base: HTMLImageElement | null,
  panels: UvGeometry | null,
  mode: FillMode = 'colour',
): CachedMask | null {
  if (!base) return null

  const source = pixelsOf(base)
  if (!source) return null

  const region = regionFor(seed, tolerance, parseHexColor(color), source, panels, mode)
  if (!region || region.width === 0 || region.height === 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = region.width
  canvas.height = region.height
  const context = canvas.getContext('2d')
  if (!context) return null

  const image = context.createImageData(region.width, region.height)
  image.data.set(region.data)
  context.putImageData(image, 0, 0)

  return { canvas, x: region.x, y: region.y, color }
}

/// The mask in the colour asked for. The shape is the expensive part and does
/// not depend on the colour, so a recolour repaints the bitmap in place —
/// dragging the colour picker over a 4K sheet must not flood it on every tick.
function tinted(mask: CachedMask, color: string): CachedMask {
  if (mask.color === color) return mask

  const context = mask.canvas.getContext('2d')
  if (!context) return mask
  const { r, g, b } = parseHexColor(color)
  // `source-in` keeps the alpha the fill left and replaces every colour under it.
  context.globalCompositeOperation = 'source-in'
  context.fillStyle = `rgb(${r} ${g} ${b})`
  context.fillRect(0, 0, mask.canvas.width, mask.canvas.height)
  context.globalCompositeOperation = 'source-over'
  mask.color = color
  return mask
}

/// A tint has no seed and no panel; everything else stays inside the panel
/// clicked, and without the model there is no panel to stay inside of.
function regionFor(
  seed: { x: number; y: number },
  tolerance: number,
  paint: ReturnType<typeof parseHexColor>,
  source: Pixels,
  panels: UvGeometry | null,
  mode: FillMode,
): FillRegion | null {
  if (mode === 'sheet') return paintedMask(source, paint)
  if (!panels) return null

  const island = islandAt(panels, seed.x / source.width, seed.y / source.height)
  if (island === null) return null

  const panel = panelMask(panels, island, source)
  if (mode === 'zone') return islandRegion(panel, paint)
  return floodFillMask(source, seed, tolerance, paint, panel)
}

/// Rasterising an island walks every triangle in it, and the hover preview asks
/// for the same one on every move of the pointer across it.
function panelMask(panels: UvGeometry, island: number, source: Pixels): IslandMask {
  let cache = islandMasks.get(panels)
  if (!cache) {
    cache = new Map()
    islandMasks.set(panels, cache)
  }

  const key = `${island}:${source.width}x${source.height}`
  const cached = cache.get(key)
  if (cached) return cached

  const mask = islandMask(panels, island, source.width, source.height)
  cache.set(key, mask)
  return mask
}

function geometryOf(mesh: CarMeshData): UvGeometry {
  const cached = geometries.get(mesh)
  if (cached) return cached
  const built = uvGeometryOf(mesh)
  geometries.set(mesh, built)
  return built
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

/// Everything that changes the shape, and nothing that only changes its colour.
function maskKey(layer: BucketLayer) {
  const seed = `${Math.round(layer.x)}:${Math.round(layer.y)}`
  return `${layer.id}:${seed}:${layer.tolerance}:${layer.mode ?? 'colour'}`
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
