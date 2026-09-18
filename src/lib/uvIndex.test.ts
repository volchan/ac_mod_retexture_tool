import { describe, expect, it } from 'vitest'
import { barycentric, buildUvIndex, cellOf, locate, UV_CELLS } from './uvIndex'

/// One triangle covering the bottom-left corner of the sheet, lying flat in the
/// z = 0 plane so a found point reads straight off its coordinates.
const UVS = new Float32Array([0, 0, 0.5, 0, 0, 0.5])
const POSITIONS = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0])
const TRIANGLES = new Uint32Array([0, 1, 2])

function index() {
  return buildUvIndex(UVS, TRIANGLES)
}

describe('cellOf', () => {
  it('splits the sheet into the agreed number of cells', () => {
    expect(cellOf(0)).toBe(0)
    expect(cellOf(0.5)).toBe(UV_CELLS / 2)
  })

  /// The build clamps when it fills a cell, so a lookup that does not would
  /// address one nothing was ever bucketed into.
  it('clamps a coordinate that is off the sheet into the nearest cell', () => {
    expect(cellOf(1)).toBe(UV_CELLS - 1)
    expect(cellOf(4.2)).toBe(UV_CELLS - 1)
    expect(cellOf(-0.3)).toBe(0)
  })
})

describe('buildUvIndex', () => {
  it('buckets a triangle under every cell it touches', () => {
    const { cells } = index()
    expect(cells.get(0)).toEqual([0])
    expect(cells.get(cellOf(0.25) * UV_CELLS + cellOf(0.25))).toEqual([0])
  })

  it('leaves the cells no triangle reaches empty', () => {
    expect(index().cells.get(cellOf(0.9) * UV_CELLS + cellOf(0.9))).toBeUndefined()
  })

  it('keeps every triangle that shares a cell', () => {
    const two = buildUvIndex(UVS, new Uint32Array([0, 1, 2, 2, 1, 0]))
    expect(two.cells.get(0)).toEqual([0, 1])
  })

  it('takes a mesh with no triangles without complaint', () => {
    expect(buildUvIndex(new Float32Array(), new Uint32Array()).cells.size).toBe(0)
  })
})

describe('locate', () => {
  it('reads a corner of the triangle back as the vertex it belongs to', () => {
    expect(locate(index(), POSITIONS, UVS, 0.5, 0)).toEqual([10, 0, 0])
  })

  it('reads a point inside the triangle in the same proportions', () => {
    const found = locate(index(), POSITIONS, UVS, 0.25, 0.25)
    expect(found).not.toBeNull()
    expect(found?.[0]).toBeCloseTo(5)
    expect(found?.[1]).toBeCloseTo(5)
  })

  it('finds nothing in a part of the sheet the car does not wear', () => {
    expect(locate(index(), POSITIONS, UVS, 0.9, 0.9)).toBeNull()
  })

  /// Both sides of the index now clamp, so the far edge lands in the last cell
  /// rather than one past it.
  it('looks in a real cell for a coordinate on the far edge', () => {
    expect(() => locate(index(), POSITIONS, UVS, 1, 1)).not.toThrow()
  })

  it('finds nothing inside a cell whose triangles do not cover the point', () => {
    // The cell at the origin holds the triangle, but this point is outside it.
    const skewed = new Float32Array([0, 0, 0.001, 0, 0, 0.001])
    const found = locate(buildUvIndex(skewed, TRIANGLES), POSITIONS, skewed, 0.005, 0.005)
    expect(found).toBeNull()
  })
})

describe('barycentric', () => {
  it('weights a corner entirely to itself', () => {
    expect(barycentric(UVS, 0, 1, 2, 0, 0)).toEqual([1, 0, 0])
  })

  it('splits the midpoint of an edge between its two ends', () => {
    const weights = barycentric(UVS, 0, 1, 2, 0.25, 0)
    expect(weights?.[0]).toBeCloseTo(0.5)
    expect(weights?.[1]).toBeCloseTo(0.5)
    expect(weights?.[2]).toBeCloseTo(0)
  })

  it('refuses a point outside the triangle', () => {
    expect(barycentric(UVS, 0, 1, 2, 0.9, 0.9)).toBeNull()
    expect(barycentric(UVS, 0, 1, 2, -0.1, 0)).toBeNull()
  })

  /// A degenerate triangle has no area to divide by, and every weight would come
  /// back as a division by zero.
  it('refuses a triangle whose corners are collinear', () => {
    const flat = new Float32Array([0, 0, 0.5, 0, 1, 0])
    expect(barycentric(flat, 0, 1, 2, 0.25, 0)).toBeNull()
  })
})
