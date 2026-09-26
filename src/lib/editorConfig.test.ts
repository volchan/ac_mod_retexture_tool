import { describe, expect, it } from 'vitest'
import type { EditorLayer } from '@/types/index'
import { layerConfig, strokeConfigs, transformerConfig } from './editorConfig'

const context = { image: null, interactive: true }

const placement = { x: 10, y: 20, scaleX: 2, scaleY: 3, rotation: 45 }
const common = { id: 'l1', name: 'layer', visible: true, opacity: 0.5 }

const image: EditorLayer = {
  ...common,
  ...placement,
  type: 'image',
  src: '/tmp/logo.png',
  width: 64,
  height: 32,
}

const text: EditorLayer = {
  ...common,
  ...placement,
  type: 'text',
  value: '24',
  fontFamily: 'Arial',
  fontSize: 80,
  fill: '#fff',
  stroke: '#000',
  strokeWidth: 4,
}

const fill: EditorLayer = {
  ...common,
  type: 'bucket',
  x: 12,
  y: 34,
  tolerance: 32,
  color: '#c8102e',
  blend: 'multiply',
}

describe('transformerConfig', () => {
  /// Freehand rotation never lands on a round number, and a sticker a degree
  /// off reads as a mistake on a car that is symmetrical.
  it('settles on the round angles all the way round', () => {
    expect(transformerConfig.rotationSnaps).toContain(0)
    expect(transformerConfig.rotationSnaps).toContain(45)
    expect(transformerConfig.rotationSnaps).toContain(180)
    expect(transformerConfig.rotationSnaps).toContain(315)
    expect(transformerConfig.rotationSnapTolerance).toBeGreaterThan(0)
  })

  it('snaps to nothing it cannot reach by dragging', () => {
    for (const angle of transformerConfig.rotationSnaps) {
      expect(angle).toBeGreaterThanOrEqual(0)
      expect(angle).toBeLessThan(360)
    }
  })
})

describe('layerConfig', () => {
  it('carries an image layer placement and bitmap through', () => {
    const bitmap = {} as HTMLImageElement
    const config = layerConfig(image, { ...context, image: bitmap })
    expect(config).toMatchObject({ ...placement, id: 'l1', width: 64, height: 32, image: bitmap })
  })

  it('paints text over its own outline so the stroke never eats the glyph', () => {
    expect(layerConfig(text, context)).toMatchObject({
      text: '24',
      fontSize: 80,
      strokeWidth: 4,
      fillAfterStrokeEnabled: true,
    })
  })

  it('draws a fill region at the origin, since its mask is already texture sized', () => {
    const mask = {} as HTMLCanvasElement
    expect(layerConfig(fill, { ...context, image: mask })).toMatchObject({
      x: 0,
      y: 0,
      image: mask,
      globalCompositeOperation: 'multiply',
    })
  })

  it('never lets a fill layer intercept a click', () => {
    expect(layerConfig(fill, context).listening).toBe(false)
  })

  /// The transformer works out each drag from the node's own anchor, and the
  /// document re-renders mid-drag: an anchor that jumped a box width the moment
  /// the scale crossed zero left the handles off the corners, shrank the layer
  /// over a few drags, and swung rotation around the far corner.
  it('holds a mirrored image on the same anchor as an unmirrored one', () => {
    const flipped = layerConfig({ ...image, scaleX: -2 }, context)
    expect(flipped).toMatchObject({ scaleX: -2, offsetX: 0, offsetY: 0 })
  })

  it('holds the anchor on the other axis too', () => {
    const flipped = layerConfig({ ...image, scaleY: -3 }, context)
    expect(flipped).toMatchObject({ scaleY: -3, offsetX: 0, offsetY: 0 })
  })

  it('holds a mirrored text on its anchor', () => {
    const flipped = layerConfig({ ...text, scaleX: -1 }, context)
    expect(flipped).toMatchObject({ scaleX: -1, offsetX: 0, offsetY: 0 })
  })

  it('places an ellipse by its corner whichever way it is mirrored', () => {
    const ellipse: EditorLayer = {
      ...common,
      ...placement,
      type: 'shape',
      shape: 'ellipse',
      width: 64,
      height: 32,
      fill: '#fff',
      stroke: '#000',
      strokeWidth: 0,
      cornerRadius: 0,
    }
    expect(layerConfig(ellipse, context)).toMatchObject({ offsetX: -32, offsetY: -16 })
    expect(layerConfig({ ...ellipse, scaleX: -2 }, context)).toMatchObject({ offsetX: -32 })
  })

  it('leaves an unmirrored image at its own origin', () => {
    expect(layerConfig(image, context)).toMatchObject({ offsetX: 0, offsetY: 0 })
  })

  it('stops layers listening while a paint tool is active', () => {
    const config = layerConfig(image, { ...context, interactive: false })
    expect(config).toMatchObject({ draggable: false, listening: false })
  })

  it('returns an inert node for a stroke layer, which renders as lines instead', () => {
    const strokes: EditorLayer = { ...common, type: 'strokes', strokes: [] }
    expect(layerConfig(strokes, context)).toEqual({ id: 'l1', listening: false })
  })
})

describe('strokeConfigs', () => {
  it('cuts through what is below it when erasing', () => {
    const configs = strokeConfigs({
      opacity: 1,
      strokes: [{ points: [0, 0, 5, 5], color: '#fff', size: 8, erase: true }],
    })
    expect(configs[0].globalCompositeOperation).toBe('destination-out')
  })

  it('paints normally otherwise', () => {
    const configs = strokeConfigs({
      opacity: 0.4,
      strokes: [{ points: [0, 0, 5, 5], color: '#f00', size: 8, erase: false }],
    })
    expect(configs[0]).toMatchObject({
      globalCompositeOperation: 'source-over',
      stroke: '#f00',
      strokeWidth: 8,
      opacity: 0.4,
      lineCap: 'round',
    })
  })

  it('gives every stroke of a layer its own key', () => {
    const configs = strokeConfigs({
      opacity: 1,
      strokes: [
        { points: [0, 0, 1, 1], color: '#fff', size: 2, erase: false },
        { points: [0, 0, 1, 1, 2, 2], color: '#fff', size: 2, erase: false },
      ],
    })
    expect(new Set(configs.map((c) => c.key)).size).toBe(2)
  })
})
