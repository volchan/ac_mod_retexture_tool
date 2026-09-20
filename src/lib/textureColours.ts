/// The colours a painted texture actually wears, read off its pixels.
///
/// Ranking the editor's layers would have been free, but a livery is as often
/// an image dropped onto the texture as it is a stack of drawn shapes, and a
/// dropped one carries no coloured layer to rank. The pixels are the one source
/// that is right either way.

/// Sampling grid. A livery's dominant colours are flat panels metres across;
/// reading a 7168-wide sheet at full size to find them would cost 25 M pixels
/// to answer a question 9 000 already answer.
const SAMPLE_SIZE = 96

/// Below this a pixel is a hole in the sheet rather than paint. A car texture
/// is mostly transparent — the panels are islands on an empty atlas.
const OPAQUE_ENOUGH = 128

/// Channel resolution the counting buckets at. Finer splits one flat panel
/// across neighbouring buckets and ranks a gradient above it.
const LEVELS = 16

/// How far apart the two ranked colours must be for the split to read as two
/// colours. Squared RGB distance, so this is about 60 per channel.
const MIN_SEPARATION = 10_000

export function sampleColours(source: CanvasImageSource, wanted = 2): string[] {
  const counts = countBuckets(source)
  if (!counts) return []

  const ranked = [...counts.entries()].sort(([, a], [, b]) => b - a).map(([bucket]) => bucket)

  return pickDistinct(ranked, wanted).map(hexOf)
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

function countBuckets(source: CanvasImageSource): Map<number, number> | null {
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_SIZE
  canvas.height = SAMPLE_SIZE

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  context.drawImage(source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
  const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

  const counts = new Map<number, number>()
  for (let at = 0; at < data.length; at += 4) {
    if (data[at + 3] < OPAQUE_ENOUGH) continue

    const bucket = bucketOf(data[at], data[at + 1], data[at + 2])
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }

  return counts.size > 0 ? counts : null
}

/// Takes the most common colour, then the most common one far enough from what
/// is already taken. Two near-identical shades would draw the badge's diagonal
/// as a single flat square.
function pickDistinct(ranked: number[], wanted: number): number[] {
  const picked: number[] = []

  for (const bucket of ranked) {
    if (picked.length >= wanted) break
    if (picked.every((taken) => separation(taken, bucket) >= MIN_SEPARATION)) picked.push(bucket)
  }

  // Nothing else stood far enough away: a single-colour livery is a real
  // answer, and the badge splits it against itself rather than inventing one.
  return picked
}

function separation(one: number, other: number): number {
  const [r, g, b] = channelsOf(one)
  const [r2, g2, b2] = channelsOf(other)
  return (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2
}

function bucketOf(r: number, g: number, b: number): number {
  const step = 256 / LEVELS
  return (
    Math.min(LEVELS - 1, Math.floor(r / step)) * LEVELS * LEVELS +
    Math.min(LEVELS - 1, Math.floor(g / step)) * LEVELS +
    Math.min(LEVELS - 1, Math.floor(b / step))
  )
}

/// The middle of the bucket rather than its floor, so a white panel comes back
/// near white instead of a sixteenth darker.
function channelsOf(bucket: number): [number, number, number] {
  const step = 256 / LEVELS
  const middle = step / 2
  return [
    Math.floor(bucket / (LEVELS * LEVELS)) * step + middle,
    Math.floor((bucket / LEVELS) % LEVELS) * step + middle,
    (bucket % LEVELS) * step + middle,
  ]
}

function hexOf(bucket: number): string {
  const channels = channelsOf(bucket).map((value) =>
    Math.min(255, Math.round(value)).toString(16).padStart(2, '0'),
  )
  return `#${channels.join('')}`
}
