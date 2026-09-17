export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface FillColor {
  r: number
  g: number
  b: number
}

/// Builds an RGBA mask covering the region connected to `seed` whose colour is
/// within `tolerance` of the seed's own. Scanline flood fill: a texture is
/// millions of pixels, and a naive four-way recursion overflows the stack long
/// before it finishes a car panel.
///
/// `barrier` marks pixels the fill may not cross, one byte per pixel. A car
/// texture is mostly flat colour, so a plain colour fill runs from the bonnet
/// straight across the sheet into the doors; the UV island outlines stop it at
/// the panel it was aimed at.
export function floodFillMask(
  source: Pixels,
  seed: { x: number; y: number },
  tolerance: number,
  color: FillColor,
  barrier?: Uint8Array,
): Uint8ClampedArray {
  const { width, height, data } = source
  const mask = new Uint8ClampedArray(width * height * 4)

  const startX = Math.floor(seed.x)
  const startY = Math.floor(seed.y)
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return mask

  const target = readPixel(data, (startY * width + startX) * 4)
  const limit = tolerance * tolerance
  const filled = new Uint8Array(width * height)
  const stack: number[] = [startX, startY]

  const open = (x: number, y: number) => {
    const index = y * width + x
    if (barrier && barrier[index] !== 0) return false
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
      const index = y * width + x
      if (filled[index] === 1) break
      filled[index] = 1
      paint(mask, index * 4, color)

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

  return mask
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

function readPixel(data: Uint8ClampedArray, offset: number): FillColor {
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2] }
}

/// Squared distance, so the comparison needs no square root per pixel.
function matches(
  data: Uint8ClampedArray,
  offset: number,
  target: FillColor,
  squaredTolerance: number,
): boolean {
  const dr = data[offset] - target.r
  const dg = data[offset + 1] - target.g
  const db = data[offset + 2] - target.b
  return dr * dr + dg * dg + db * db <= squaredTolerance
}

function paint(mask: Uint8ClampedArray, offset: number, color: FillColor) {
  mask[offset] = color.r
  mask[offset + 1] = color.g
  mask[offset + 2] = color.b
  mask[offset + 3] = 255
}

export function parseHexColor(hex: string): FillColor {
  const value = hex.replace('#', '')
  return {
    r: Number.parseInt(value.slice(0, 2), 16) || 0,
    g: Number.parseInt(value.slice(2, 4), 16) || 0,
    b: Number.parseInt(value.slice(4, 6), 16) || 0,
  }
}
