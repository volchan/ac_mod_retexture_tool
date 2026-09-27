import { describe, expect, it } from 'vitest'
import { meshOf, twoPanels } from '@/test-fixtures/mesh'
import { islandAt, islandMask, islandsOf, uvGeometryOf } from './uvIslands'

function covered(mask: ReturnType<typeof islandMask>): number {
  return mask.inside.reduce((total, pixel) => total + pixel, 0)
}

describe('islandsOf', () => {
  it('joins the triangles of a panel and keeps panels apart', () => {
    const { islands } = uvGeometryOf(twoPanels())

    expect(islands[0]).toBe(islands[1])
    expect(islands[2]).toBe(islands[3])
    expect(islands[0]).not.toBe(islands[2])
  })

  /// A model splits a vertex wherever its normal creases, so two triangles of
  /// one flat panel can share an edge without sharing a single vertex index.
  it('joins triangles that meet at the same UVs through split vertices', () => {
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1])
    const islands = islandsOf(uvs, new Uint32Array([0, 1, 2, 3, 4, 5]))

    expect(islands[0]).toBe(islands[1])
  })
})

describe('islandAt', () => {
  it('names the panel under a point', () => {
    const geometry = uvGeometryOf(twoPanels())

    expect(islandAt(geometry, 0.1, 0.5)).toBe(geometry.islands[0])
    expect(islandAt(geometry, 0.9, 0.5)).toBe(geometry.islands[2])
  })

  it('finds nothing over the hole between panels', () => {
    expect(islandAt(uvGeometryOf(twoPanels()), 0.5, 0.5)).toBeNull()
  })
})

describe('islandMask', () => {
  /// A panel left bare for the car's paint colour is transparent on the sheet,
  /// so only the model can say it is there at all.
  it('covers the whole panel and runs a little past its edge', () => {
    const geometry = uvGeometryOf(twoPanels())

    const mask = islandMask(geometry, geometry.islands[0], 16, 8)

    // Six pixels wide on a 16 pixel sheet, plus two of bleed to the right.
    expect(mask).toMatchObject({ x: 0, y: 0, width: 8, height: 8 })
    expect(covered(mask)).toBe(8 * 8)
  })

  it('leaves the other panel out', () => {
    const geometry = uvGeometryOf(twoPanels())

    const mask = islandMask(geometry, geometry.islands[2], 16, 8)

    expect(mask.x).toBeGreaterThanOrEqual(8)
  })

  /// A tiling UV runs past the sheet, and a mask that followed it would index
  /// pixels that do not exist.
  it('stops at the edge of the sheet', () => {
    const geometry = uvGeometryOf(meshOf([-1, -1, 2, -1, 2, 2], [0, 1, 2]))

    const mask = islandMask(geometry, geometry.islands[0], 4, 4)

    expect(mask).toMatchObject({ x: 0, y: 0, width: 4, height: 4 })
  })

  it('draws nothing for a triangle with no area', () => {
    const geometry = uvGeometryOf(meshOf([0.5, 0.5, 0.5, 0.5, 0.5, 0.5], [0, 1, 2]))

    expect(covered(islandMask(geometry, geometry.islands[0], 8, 8))).toBe(0)
  })
})
