import type { EditorLayer } from '@/types/index'

/// Which colours a livery reads as, ranked by how much of the texture wears
/// them. What the entry-list badge is painted with, so it answers "whose car is
/// that" at a glance rather than describing the paint precisely.

/// What a skin with nothing coloured on it falls back to: AC's own empty-slot
/// grey, rather than a black badge that reads as a bug.
export const FALLBACK_COLOURS = ['#8A8A8A', '#3C3C3C']

/// Area a bucket covers, by layer id. A bucket stores only its seed point, so
/// its size is whatever the fill reached — known to the mask cache and nowhere
/// else. Ids missing from the map score zero and rank last.
export type BucketAreas = ReadonlyMap<string, number>

export function dominantColours(
  layers: readonly EditorLayer[],
  bucketAreas: BucketAreas = new Map(),
  wanted = 2,
): string[] {
  const totals = new Map<string, number>()

  for (const layer of layers) {
    if (!layer.visible || layer.opacity <= 0) continue

    for (const [colour, area] of colouredAreas(layer, bucketAreas)) {
      if (area <= 0) continue
      totals.set(colour, (totals.get(colour) ?? 0) + area * layer.opacity)
    }
  }

  const ranked = [...totals.entries()].sort(([, a], [, b]) => b - a).map(([colour]) => colour)

  return [...ranked, ...FALLBACK_COLOURS].slice(0, wanted)
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// A layer contributes one entry per colour it paints, so a shape with a thick
/// contrasting outline counts towards both.
function colouredAreas(layer: EditorLayer, bucketAreas: BucketAreas): [string, number][] {
  switch (layer.type) {
    case 'bucket':
      return [[layer.color, bucketAreas.get(layer.id) ?? 0]]
    case 'shape':
      return shapeAreas(layer)
    case 'strokes':
      return layer.strokes
        .filter((stroke) => !stroke.erase)
        .map((stroke) => [stroke.color, polylineLength(stroke.points) * stroke.size])
    case 'text':
      // Lettering is small and high-contrast by design: counting its real area
      // would rank a white number above the body it sits on.
      return []
    default:
      return []
  }
}

function shapeAreas(layer: Extract<EditorLayer, { type: 'shape' }>): [string, number][] {
  const width = Math.abs(layer.width * layer.scaleX)
  const height = Math.abs(layer.height * layer.scaleY)
  // An ellipse fills the quarter-pi fraction of the box a rectangle fills whole.
  const filled = layer.shape === 'ellipse' ? (width * height * Math.PI) / 4 : width * height

  const outline = Math.abs(layer.strokeWidth) * 2 * (width + height)
  return [
    [layer.fill, filled],
    [layer.stroke, outline],
  ]
}

/// Flat x,y pairs, the shape Konva.Line expects.
function polylineLength(points: readonly number[]): number {
  let total = 0
  for (let index = 2; index + 1 < points.length; index += 2) {
    total += Math.hypot(points[index] - points[index - 2], points[index + 1] - points[index - 1])
  }
  return total
}
