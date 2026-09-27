import type { IslandMask } from '@/lib/uvIslands'

export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

/// What decides whether a pixel joins the fill.
///
/// `colour` matches the seed's own colour within a tolerance, inside the panel
/// clicked. `zone` is that whole panel as the model lays it out, so a panel
/// split across four colours is recoloured in one click. `sheet` needs no seed:
/// it is every painted pixel on the texture, which is what tinting a car means.
export type FillMode = 'colour' | 'zone' | 'sheet'

/// Under this a pixel is a hole in the atlas rather than bodywork, as far as a
/// tint can tell without the model.
const PAINTED = 8

export interface FillColor {
  r: number
  g: number
  b: number
}

/// An RGBA bitmap of the filled region, cropped to it, and where that crop sits
/// on the texture. A panel covers a fraction of a 4K sheet, and a full-size mask
/// would cost 67 MB to hold a few hundred thousand painted pixels.
export interface FillRegion {
  data: Uint8ClampedArray
  x: number
  y: number
  width: number
  height: number
}

const EMPTY_REGION: FillRegion = {
  data: new Uint8ClampedArray(0),
  x: 0,
  y: 0,
  width: 0,
  height: 0,
}

/// Builds an RGBA mask covering the region connected to `seed` whose colour is
/// within `tolerance` of the seed's own. Scanline flood fill: a texture is
/// millions of pixels, and a naive four-way recursion overflows the stack long
/// before it finishes a car panel.
///
/// `within` is the panel the fill may not leave. A car texture is mostly flat
/// colour and mostly holes, so a plain colour fill runs from the bonnet across
/// every hole on the sheet into the doors — and on a 22 megapixel sheet, doing
/// that on every move of the pointer is what took the whole app down.
export function floodFillMask(
  source: Pixels,
  seed: { x: number; y: number },
  tolerance: number,
  color: FillColor,
  within?: IslandMask,
): FillRegion {
  const { width, height, data } = source

  const startX = Math.floor(seed.x)
  const startY = Math.floor(seed.y)
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) {
    return EMPTY_REGION
  }
  if (within && !covers(within, startX, startY)) {
    return EMPTY_REGION
  }

  const target = (startY * width + startX) * 4
  const limit = tolerance * tolerance

  const filled = new Uint8Array(width * height)
  const stack: number[] = [startX, startY]
  const bounds = { minX: width, minY: height, maxX: -1, maxY: -1 }

  /// A pixel this fill may still take. Counting already-filled ones as closed
  /// costs nothing and saves the walk left crossing a span that is already done,
  /// only for the walk right to stop on its first pixel — and it keeps rows that
  /// are already painted from being pushed back onto the stack.
  const open = (x: number, y: number) => {
    const index = y * width + x
    if (filled[index] === 1) return false
    if (within && !covers(within, x, y)) return false
    return matches(data, index * 4, target, limit)
  }

  while (stack.length > 0) {
    const y = stack.pop() as number
    let x = stack.pop() as number

    while (x >= 0 && open(x, y)) x -= 1
    x += 1

    let spanAbove = false
    let spanBelow = false

    while (x < width && open(x, y)) {
      filled[y * width + x] = 1
      stretch(bounds, x, y)

      if (y > 0) {
        const above = open(x, y - 1)
        if (above && !spanAbove) {
          stack.push(x, y - 1)
          spanAbove = true
        } else if (!above) {
          spanAbove = false
        }
      }

      if (y < height - 1) {
        const below = open(x, y + 1)
        if (below && !spanBelow) {
          stack.push(x, y + 1)
          spanBelow = true
        } else if (!below) {
          spanBelow = false
        }
      }

      x += 1
    }
  }

  return crop(filled, width, bounds, color)
}

/// Every painted pixel on the sheet, ignoring where they are and what colour
/// they wear. A tint has no seed to spread from: a car atlas is dozens of
/// unconnected islands, and a flood fill would only ever reach the one clicked.
export function paintedMask(source: Pixels, color: FillColor): FillRegion {
  const { width, height, data } = source
  const filled = new Uint8Array(width * height)
  const bounds = { minX: width, minY: height, maxX: -1, maxY: -1 }

  for (let pixel = 0; pixel < filled.length; pixel += 1) {
    if (data[pixel * 4 + 3] < PAINTED) continue
    filled[pixel] = 1
    stretch(bounds, pixel % width, Math.floor(pixel / width))
  }

  return crop(filled, width, bounds, color)
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// Squared distance, so the comparison needs no square root per pixel. Alpha
/// counts: a panel left bare for the car's paint colour is transparent black,
/// and matching colour alone would run it into every black stripe on the car.
function matches(
  data: Uint8ClampedArray,
  offset: number,
  target: number,
  squaredTolerance: number,
) {
  let distance = 0
  for (let channel = 0; channel < 4; channel += 1) {
    const delta = data[offset + channel] - data[target + channel]
    distance += delta * delta
  }
  return distance <= squaredTolerance
}

function covers(mask: IslandMask, x: number, y: number): boolean {
  const localX = x - mask.x
  const localY = y - mask.y
  if (localX < 0 || localY < 0 || localX >= mask.width || localY >= mask.height) {
    return false
  }
  return mask.inside[localY * mask.width + localX] === 1
}

/// The island itself, in `color`: a zone fill is the whole panel, whatever is
/// painted on it and whatever colour the sheet leaves it.
export function islandRegion(mask: IslandMask, color: FillColor): FillRegion {
  const data = new Uint8ClampedArray(mask.width * mask.height * 4)
  mask.inside.forEach((isInside, pixel) => {
    if (isInside === 1) {
      data.set([color.r, color.g, color.b, 255], pixel * 4)
    }
  })
  return { data, x: mask.x, y: mask.y, width: mask.width, height: mask.height }
}

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function stretch(bounds: Bounds, x: number, y: number) {
  if (x < bounds.minX) {
    bounds.minX = x
  }
  if (x > bounds.maxX) {
    bounds.maxX = x
  }
  if (y < bounds.minY) {
    bounds.minY = y
  }
  if (y > bounds.maxY) {
    bounds.maxY = y
  }
}

/// Paints the filled pixels into a bitmap the size of their bounding box. The
/// colour is uniform, so only the region's shape has to be carried over.
function crop(
  filled: Uint8Array,
  sourceWidth: number,
  bounds: Bounds,
  color: FillColor,
): FillRegion {
  if (bounds.maxX < bounds.minX) {
    return EMPTY_REGION
  }

  const width = bounds.maxX - bounds.minX + 1
  const height = bounds.maxY - bounds.minY + 1
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (filled[(y + bounds.minY) * sourceWidth + (x + bounds.minX)] !== 1) {
        continue
      }
      const offset = (y * width + x) * 4
      data[offset] = color.r
      data[offset + 1] = color.g
      data[offset + 2] = color.b
      data[offset + 3] = 255
    }
  }

  return { data, x: bounds.minX, y: bounds.minY, width, height }
}

/// Accepts `#rgb` and `#rrggbb`, with or without the hash.
///
/// Throws rather than defaulting a channel it cannot read: every `|| 0` here
/// turned a typo or a truncated colour into a black fill that looked like a
/// deliberate one, and the only way to find out was to paint it.
///
/// Render-time callers may rely on that: a stored document is checked against
/// `isHexColor` by `parseDocument` in `useLiveryPersistence.ts` before a layer
/// ever reaches the canvas, so a throw here means a bug rather than bad input.
export function parseHexColor(hex: string): FillColor {
  const value = hex.replace('#', '')
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : value

  if (!/^[0-9a-f]{6}$/i.test(expanded)) {
    throw new Error(`Not a colour: ${hex}`)
  }

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  }
}

/// Whether `parseHexColor` would accept this, for callers validating at a trust
/// boundary rather than mid-render.
export function isHexColor(hex: string): boolean {
  try {
    parseHexColor(hex)
    return true
  } catch {
    return false
  }
}
