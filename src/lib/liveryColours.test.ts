import { describe, expect, it } from 'vitest'
import { bucketLayer, shapeLayer, strokeLayer, textLayer } from '@/test-fixtures/layers'
import { dominantColours, FALLBACK_COLOURS } from './liveryColours'

describe('dominantColours', () => {
  it('ranks the colour covering the most of the texture first', () => {
    const layers = [
      shapeLayer({ fill: '#E8E8E8', stroke: '#000000', strokeWidth: 0, width: 100, height: 100 }),
      shapeLayer({ fill: '#1B4D8F', stroke: '#000000', strokeWidth: 0, width: 400, height: 400 }),
    ]

    expect(dominantColours(layers)).toEqual(['#1B4D8F', '#E8E8E8'])
  })

  it('adds up every layer wearing the same colour', () => {
    const layers = [
      shapeLayer({ fill: '#E8E8E8', stroke: '#000', strokeWidth: 0, width: 250, height: 250 }),
      shapeLayer({ fill: '#1B4D8F', stroke: '#000', strokeWidth: 0, width: 200, height: 200 }),
      shapeLayer({ fill: '#1B4D8F', stroke: '#000', strokeWidth: 0, width: 200, height: 200 }),
    ]

    expect(dominantColours(layers)[0]).toBe('#1B4D8F')
  })

  /// A bucket stores a seed point and nothing else, so the fill's size is only
  /// known to whoever holds the mask.
  it('sizes a bucket from the areas it is handed', () => {
    const body = bucketLayer({ id: 'body', color: '#1B4D8F' })
    const roof = bucketLayer({ id: 'roof', color: '#E8E8E8' })

    const ranked = dominantColours(
      [body, roof],
      new Map([
        ['body', 2_100_000],
        ['roof', 340_000],
      ]),
    )

    expect(ranked).toEqual(['#1B4D8F', '#E8E8E8'])
  })

  it('ranks a bucket whose area is unknown behind one that is known', () => {
    const measured = bucketLayer({ id: 'measured', color: '#1B4D8F' })
    const unmeasured = bucketLayer({ id: 'unmeasured', color: '#E8E8E8' })

    const ranked = dominantColours([unmeasured, measured], new Map([['measured', 10]]))

    expect(ranked[0]).toBe('#1B4D8F')
  })

  it('counts a shape outline as its own colour', () => {
    const layers = [
      shapeLayer({ fill: '#1B4D8F', stroke: '#FFD700', strokeWidth: 40, width: 200, height: 200 }),
    ]

    expect(dominantColours(layers)).toContain('#FFD700')
  })

  it('weighs a brush stroke by how far it runs and how wide it is', () => {
    const thin = strokeLayer({
      strokes: [{ points: [0, 0, 100, 0], color: '#E8E8E8', size: 2, erase: false }],
    })
    const thick = strokeLayer({
      strokes: [{ points: [0, 0, 100, 0], color: '#1B4D8F', size: 60, erase: false }],
    })

    expect(dominantColours([thin, thick])[0]).toBe('#1B4D8F')
  })

  it('ignores an eraser stroke, which paints nothing', () => {
    const layers = [
      strokeLayer({
        strokes: [{ points: [0, 0, 999, 0], color: '#FF0000', size: 90, erase: true }],
      }),
      shapeLayer({ fill: '#1B4D8F', stroke: '#000', strokeWidth: 0, width: 10, height: 10 }),
    ]

    expect(dominantColours(layers)[0]).toBe('#1B4D8F')
  })

  /// Lettering is small and deliberately high-contrast: counted honestly it
  /// would still rank above nothing, and a white number would become the
  /// badge's second colour on every skin that has one.
  it('leaves text out of the ranking', () => {
    expect(dominantColours([textLayer({ fill: '#FFFFFF' })])).toEqual(FALLBACK_COLOURS)
  })

  it('skips a layer that is hidden or fully transparent', () => {
    const layers = [
      shapeLayer({ fill: '#FF0000', stroke: '#000', strokeWidth: 0, width: 900, height: 900 }),
      shapeLayer({ fill: '#00FF00', stroke: '#000', strokeWidth: 0, width: 800, height: 800 }),
      shapeLayer({ fill: '#1B4D8F', stroke: '#000', strokeWidth: 0, width: 10, height: 10 }),
    ]
    layers[0].visible = false
    layers[1].opacity = 0

    expect(dominantColours(layers)[0]).toBe('#1B4D8F')
  })

  it('fades a translucent layer behind an opaque one of the same size', () => {
    const faint = shapeLayer({ fill: '#FF0000', stroke: '#000', strokeWidth: 0 })
    const solid = shapeLayer({ fill: '#1B4D8F', stroke: '#000', strokeWidth: 0 })
    faint.opacity = 0.2

    expect(dominantColours([faint, solid])[0]).toBe('#1B4D8F')
  })

  /// A badge is drawn for every skin, including one that has only had an image
  /// dropped onto it and carries no coloured layer at all.
  it('falls back rather than returning nothing', () => {
    expect(dominantColours([])).toEqual(FALLBACK_COLOURS)
  })

  it('pads a single found colour up to the count asked for', () => {
    const only = shapeLayer({ fill: '#1B4D8F', stroke: '#000', strokeWidth: 0 })

    expect(dominantColours([only])).toEqual(['#1B4D8F', FALLBACK_COLOURS[0]])
  })

  it('returns as many colours as the caller asks for', () => {
    expect(dominantColours([], new Map(), 1)).toEqual([FALLBACK_COLOURS[0]])
  })
})
