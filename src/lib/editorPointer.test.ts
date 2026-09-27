import { describe, expect, it } from 'vitest'
import { pointerIntent } from './editorPointer'

const background = { isStage: true, onTransformer: false, id: '' }
const layer = { isStage: false, onTransformer: false, id: 'layer-1' }
const handle = { isStage: false, onTransformer: true, id: '' }

describe('pointerIntent', () => {
  it('treats a press with the bucket as a fill wherever it lands', () => {
    expect(pointerIntent('bucket', layer)).toEqual({ kind: 'fill' })
    expect(pointerIntent('bucket', { isStage: true, onTransformer: false, id: '' })).toEqual({
      kind: 'fill',
    })
  })

  it('paints with a brush wherever the press lands', () => {
    expect(pointerIntent('brush', layer)).toEqual({ kind: 'paint' })
    expect(pointerIntent('eraser', background)).toEqual({ kind: 'paint' })
    expect(pointerIntent('eraser', handle)).toEqual({ kind: 'paint' })
  })

  it('selects the layer that was pressed', () => {
    expect(pointerIntent('select', layer)).toEqual({ kind: 'select', id: 'layer-1' })
  })

  it('pans from the base texture', () => {
    expect(pointerIntent('select', background)).toEqual({ kind: 'pan' })
  })

  it('leaves a transformer handle to Konva rather than clearing the selection', () => {
    expect(pointerIntent('select', handle)).toEqual({ kind: 'transform' })
  })

  it('prefers the transformer over a node underneath it', () => {
    expect(pointerIntent('select', { isStage: false, onTransformer: true, id: 'layer-1' })).toEqual(
      { kind: 'transform' },
    )
  })

  it('treats an unidentified node as background rather than selecting nothing', () => {
    expect(pointerIntent('select', { isStage: false, onTransformer: false, id: '' })).toEqual({
      kind: 'pan',
    })
  })

  it('samples a colour with the pipette, wherever the press lands', () => {
    expect(pointerIntent('eyedropper', background)).toEqual({ kind: 'pick' })
    expect(pointerIntent('eyedropper', { ...background, onTransformer: true })).toEqual({
      kind: 'pick',
    })
  })
})
