import { describe, expect, it } from 'vitest'
import { floodFillMask, type Pixels, parseHexColor } from './floodFill'

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

function filledCount(mask: Uint8ClampedArray) {
  let count = 0
  for (let i = 3; i < mask.length; i += 4) if (mask[i] === 255) count += 1
  return count
}

describe('floodFillMask', () => {
  it('covers the connected region that shares the seed colour', () => {
    const mask = floodFillMask(strip(), { x: 0, y: 0 }, 10, RED)
    expect(filledCount(mask)).toBe(4)
  })

  it('stops at a colour outside the tolerance', () => {
    const mask = floodFillMask(strip(), { x: 0, y: 0 }, 10, RED)
    // First pixel of the blue half stays untouched.
    expect(mask[2 * 4 + 3]).toBe(0)
  })

  it('crosses the boundary once the tolerance is wide enough', () => {
    const mask = floodFillMask(strip(), { x: 0, y: 0 }, 400, RED)
    expect(filledCount(mask)).toBe(8)
  })

  it('paints the requested colour, not the one it replaced', () => {
    const mask = floodFillMask(strip(), { x: 0, y: 0 }, 10, { r: 1, g: 2, b: 3 })
    expect([mask[0], mask[1], mask[2], mask[3]]).toEqual([1, 2, 3, 255])
  })

  it('fills from a seed in the middle of the region', () => {
    const mask = floodFillMask(strip(), { x: 3, y: 1 }, 10, RED)
    expect(filledCount(mask)).toBe(4)
  })

  it('returns an empty mask for a seed outside the texture', () => {
    expect(filledCount(floodFillMask(strip(), { x: 99, y: 0 }, 10, RED))).toBe(0)
    expect(filledCount(floodFillMask(strip(), { x: -1, y: 0 }, 10, RED))).toBe(0)
  })

  it('fills a single pixel when nothing around it matches', () => {
    const data = new Uint8ClampedArray(4 * 4)
    data.set([10, 10, 10, 255], 0)
    data.set([200, 200, 200, 255], 4)
    const mask = floodFillMask({ data, width: 2, height: 2 }, { x: 0, y: 0 }, 5, RED)
    expect(filledCount(mask)).toBe(1)
  })
})

describe('parseHexColor', () => {
  it('reads a six digit hex colour', () => {
    expect(parseHexColor('#c8102e')).toEqual({ r: 200, g: 16, b: 46 })
  })

  it('tolerates a missing hash', () => {
    expect(parseHexColor('ffffff')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('falls back to zero on a malformed channel', () => {
    expect(parseHexColor('#zzzzzz')).toEqual({ r: 0, g: 0, b: 0 })
  })
})
