/// The colours a painted texture actually wears, read off its pixels.
///
/// Ranking the editor's layers would have been free, but a livery is as often
/// an image dropped onto the texture as it is a stack of drawn shapes, and a
/// dropped one carries no coloured layer to rank. The pixels are the one source
/// that is right either way.

/// Sampling grid. A livery's dominant colours are flat panels metres across;
/// reading a 7168-wide sheet at full size to find them would cost 25 M pixels
/// to answer a question 16 000 already answer.
const SAMPLE_SIZE = 128

/// Below this a pixel is a hole in the sheet rather than paint. A car texture
/// is mostly transparent — the panels are islands on an empty atlas.
const OPAQUE_ENOUGH = 128

/// Channel resolution the counting buckets at. Finer splits one flat panel
/// across neighbouring buckets and ranks a gradient above it.
const LEVELS = 16

/// How far apart two colours must be for the badge's split to read as a split.
///
/// Measured the way an eye separates paint rather than as RGB distance. Black
/// and a deep red sit close together in RGB and are obviously two colours on a
/// car, so lightness and colourfulness are judged apart, and hue only once both
/// sides have enough colour in them for a hue to mean anything.
const APART = { lightness: 0.15, chroma: 0.12, hue: 30, colourful: 0.1 }

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

  // Nearest neighbour, not the browser's smoothing: averaging a 7168-wide
  // sheet down to this blends every red panel with the black beside it and the
  // hole behind it, and the livery comes back as one muddy dark tone.
  context.imageSmoothingEnabled = false
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
    if (picked.every((taken) => distinct(taken, bucket))) picked.push(bucket)
  }

  // Nothing else stood far enough away: a single-colour livery is a real
  // answer, and the badge splits it against itself rather than inventing one.
  return picked
}

function distinct(one: number, other: number): boolean {
  const a = paintOf(one)
  const b = paintOf(other)

  if (Math.abs(a.lightness - b.lightness) > APART.lightness) return true
  if (Math.abs(a.chroma - b.chroma) > APART.chroma) return true

  const colourful = a.chroma > APART.colourful && b.chroma > APART.colourful
  return colourful && hueGap(a.hue, b.hue) > APART.hue
}

/// How a colour reads rather than what it is made of: how light it is, how much
/// colour is in it at all, and which colour that is.
function paintOf(bucket: number): { lightness: number; chroma: number; hue: number } {
  const [r, g, b] = channelsOf(bucket).map((value) => value / 255)
  const high = Math.max(r, g, b)
  const low = Math.min(r, g, b)
  const chroma = high - low

  return { lightness: (high + low) / 2, chroma, hue: hueOf(r, g, b, high, chroma) }
}

function hueOf(r: number, g: number, b: number, high: number, chroma: number): number {
  if (chroma === 0) return 0

  const sixth =
    high === r ? (g - b) / chroma : high === g ? 2 + (b - r) / chroma : 4 + (r - g) / chroma
  return (sixth * 60 + 360) % 360
}

/// Hue is a circle: red at 355 and red at 5 are ten degrees apart, not 350.
function hueGap(one: number, other: number): number {
  const gap = Math.abs(one - other) % 360
  return gap > 180 ? 360 - gap : gap
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
