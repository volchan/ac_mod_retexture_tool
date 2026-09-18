import type { BucketLayer, ImageLayer, ShapeLayer, StrokeLayer, TextLayer } from '@/types/index'

const common = { visible: true, opacity: 1 }
const placement = { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 }

export function textLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    ...common,
    ...placement,
    id: 'text-1',
    name: 'Text',
    type: 'text',
    value: 'Rosso',
    fontFamily: 'Arial',
    fontSize: 64,
    fill: '#ffffff',
    stroke: '#000000',
    strokeWidth: 0,
    curve: 0,
    ...overrides,
  }
}

export function shapeLayer(overrides: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    ...common,
    ...placement,
    id: 'shape-1',
    name: 'Rectangle',
    type: 'shape',
    shape: 'rect',
    width: 200,
    height: 100,
    fill: '#ff0000',
    stroke: '#000000',
    strokeWidth: 0,
    cornerRadius: 0,
    ...overrides,
  }
}

export function bucketLayer(overrides: Partial<BucketLayer> = {}): BucketLayer {
  return {
    ...common,
    id: 'bucket-1',
    name: 'Fill',
    type: 'bucket',
    x: 100,
    y: 100,
    tolerance: 32,
    color: '#00ff00',
    blend: 'source-over',
    ...overrides,
  }
}

export function imageLayer(overrides: Partial<ImageLayer> = {}): ImageLayer {
  return {
    ...common,
    ...placement,
    id: 'image-1',
    name: 'shell.png',
    type: 'image',
    src: '/tmp/shell.png',
    width: 128,
    height: 64,
    ...overrides,
  }
}

export function strokeLayer(overrides: Partial<StrokeLayer> = {}): StrokeLayer {
  return {
    ...common,
    id: 'strokes-1',
    name: 'Paint',
    type: 'strokes',
    strokes: [],
    ...overrides,
  }
}
