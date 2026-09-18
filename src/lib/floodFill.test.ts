import { describe, expect, it } from 'vitest'
import { type FillRegion, floodFillMask, isHexColor, type Pixels, parseHexColor } from './floodFill'

const RED = { r: 255, g: 0, b: 0 }

/// A 4×2 strip: left half red, right half blue.
function strip(): Pixels {
  const width = 4
  const height = 2
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    const onLeft = i % width < 2
    data.set(onLeft ? [200, 0, 0, 255] : [0, 0, 200, 255], i * 4)
  }
  return { data, width, height }
}

function filledCount(region: FillRegion) {
  let count = 0
  for (let i = 3; i < region.data.length; i += 4) {
    if (region.data[i] === 255) count += 1
  }
  return count
}

/// A 5×3 sheet with a wall down the middle of the top two rows — an upside-down
/// U. Reaching the far side means going down, across the open bottom row and back
/// up, which sends the fill into rows it has already partly painted.
function archway(): Pixels {
  const width = 5
  const height = 3
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    const isWall = i % width === 2 && Math.floor(i / width) < 2
    data.set(isWall ? [0, 0, 200, 255] : [200, 0, 0, 255], i * 4)
  }
  return { data, width, height }
}

describe('floodFillMask', () => {
  it('paints a region it re-enters from below', () => {
    const region = floodFillMask(archway(), { x: 0, y: 0 }, 10, RED)

    // Thirteen open pixels: fifteen in the sheet, less the two-pixel wall.
    expect(filledCount(region)).toBe(13)
    expect(region).toMatchObject({ x: 0, y: 0, width: 5, height: 3 })
  })

  it('covers the connected region that shares the seed colour', () => {
    expect(filledCount(floodFillMask(strip(), { x: 0, y: 0 }, 10, RED))).toBe(4)
  })

  it('stops at a colour outside the tolerance', () => {
    // The blue half is outside the crop entirely, not merely transparent in it.
    const region = floodFillMask(strip(), { x: 0, y: 0 }, 10, RED)
    expect(region).toMatchObject({ x: 0, y: 0, width: 2, height: 2 })
  })

  it('crosses the boundary once the tolerance is wide enough', () => {
    expect(filledCount(floodFillMask(strip(), { x: 0, y: 0 }, 400, RED))).toBe(8)
  })

  it('paints the requested colour, not the one it replaced', () => {
    const { data } = floodFillMask(strip(), { x: 0, y: 0 }, 10, { r: 1, g: 2, b: 3 })
    expect([data[0], data[1], data[2], data[3]]).toEqual([1, 2, 3, 255])
  })

  it('fills from a seed in the middle of the region', () => {
    expect(filledCount(floodFillMask(strip(), { x: 3, y: 1 }, 10, RED))).toBe(4)
  })

  /// The 67 MB full-sheet mask this replaces is what made a dozen fill layers
  /// unusable: a panel covers a fraction of the texture it sits on.
  it('crops to the filled region and says where it sits', () => {
    const region = floodFillMask(strip(), { x: 3, y: 1 }, 10, RED)
    expect(region).toMatchObject({ x: 2, y: 0, width: 2, height: 2 })
  })

  it('returns an empty mask for a seed outside the texture', () => {
    expect(filledCount(floodFillMask(strip(), { x: 99, y: 0 }, 10, RED))).toBe(0)
    expect(filledCount(floodFillMask(strip(), { x: -1, y: 0 }, 10, RED))).toBe(0)
  })

  it('fills a single pixel when nothing around it matches', () => {
    const data = new Uint8ClampedArray(4 * 4)
    data.set([10, 10, 10, 255], 0)
    data.set([200, 200, 200, 255], 4)
    const region = floodFillMask({ data, width: 2, height: 2 }, { x: 0, y: 0 }, 5, RED)
    expect(filledCount(region)).toBe(1)
    expect(region).toMatchObject({ width: 1, height: 1 })
  })
})

describe('parseHexColor', () => {
  it('reads a six digit hex colour', () => {
    expect(parseHexColor('#c8102e')).toEqual({ r: 200, g: 16, b: 46 })
  })

  it('tolerates a missing hash', () => {
    expect(parseHexColor('ffffff')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('expands the three digit form', () => {
    expect(parseHexColor('#f0a')).toEqual({ r: 255, g: 0, b: 170 })
  })

  /// Defaulting a channel it cannot read turned a typo into a black fill that
  /// looked deliberate, and the only way to notice was to paint it.
  it('refuses anything it cannot read, rather than painting black', () => {
    for (const bad of ['#zzzzzz', '#12345', 'ff', '', '#1234567']) {
      expect(() => parseHexColor(bad)).toThrow()
      expect(isHexColor(bad)).toBe(false)
    }
  })

  it('accepts both forms through the boundary check', () => {
    expect(isHexColor('#c8102e')).toBe(true)
    expect(isHexColor('f0a')).toBe(true)
  })
})
