import { describe, expect, it } from 'vitest'
import type { EditorLayer } from '@/types/index'
import { layerConfig, strokeConfigs } from './editorConfig'

const context = { image: null, textureWidth: 1024, textureHeight: 512, interactive: true }

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

  it('keeps a mirrored image in the same box as before the flip', () => {
    const flipped = layerConfig({ ...image, scaleX: -2 }, context)
    expect(flipped).toMatchObject({ scaleX: -2, offsetX: 64, offsetY: 0 })
  })

  it('offsets vertically when flipped on the other axis', () => {
    const flipped = layerConfig({ ...image, scaleY: -3 }, context)
    expect(flipped).toMatchObject({ scaleY: -3, offsetX: 0, offsetY: 32 })
  })

  it('folds a mirrored text back over its own glyphs', () => {
    const flipped = layerConfig({ ...text, scaleX: -1 }, context)
    expect(flipped.offsetX).toBeGreaterThan(0)
    expect(flipped).toMatchObject({ scaleX: -1, offsetY: 0 })
  })

  it('holds a mirrored ellipse on its centre by swapping the offset sign', () => {
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
    expect(layerConfig({ ...ellipse, scaleX: -2 }, context)).toMatchObject({ offsetX: 32 })
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
