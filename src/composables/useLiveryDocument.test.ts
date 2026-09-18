import { beforeEach, describe, expect, it } from 'vitest'
import type { BucketLayer, Texture } from '@/types/index'
import { createLayerId, useLiveryDocument } from './useLiveryDocument'

const texture = { id: 'tex1', name: 'skin_body.dds', width: 2048, height: 2048 } as Texture

function fillLayer(name: string): BucketLayer {
  return {
    id: createLayerId(),
    name,
    visible: true,
    opacity: 1,
    type: 'bucket',
    x: 10,
    y: 10,
    tolerance: 32,
    color: '#ff0000',
    blend: 'source-over',
  }
}

describe('useLiveryDocument', () => {
  beforeEach(() => {
    useLiveryDocument().init(texture)
  })

  it('opens an empty stack sized to the texture', () => {
    const doc = useLiveryDocument()
    expect(doc.layers.value).toEqual([])
    expect(doc.document.value).toMatchObject({ textureId: 'tex1', width: 2048, height: 2048 })
  })

  it('selects a layer as it is added', () => {
    const doc = useLiveryDocument()
    const layer = fillLayer('Base coat')
    doc.addLayer(layer)
    expect(doc.layers.value).toHaveLength(1)
    expect(doc.selectedLayer.value?.id).toBe(layer.id)
  })

  it('adds new layers on top of the stack', () => {
    const doc = useLiveryDocument()
    doc.addLayer(fillLayer('bottom'))
    doc.addLayer(fillLayer('top'))
    expect(doc.layers.value.map((l) => l.name)).toEqual(['bottom', 'top'])
  })

  it('clears the selection when the selected layer is removed', () => {
    const doc = useLiveryDocument()
    const layer = fillLayer('Base coat')
    doc.addLayer(layer)
    doc.removeLayer(layer.id)
    expect(doc.layers.value).toEqual([])
    expect(doc.selectedLayer.value).toBeNull()
  })

  it('moves a layer through the stack', () => {
    const doc = useLiveryDocument()
    doc.addLayer(fillLayer('a'))
    const middle = fillLayer('b')
    doc.addLayer(middle)
    doc.addLayer(fillLayer('c'))

    doc.moveLayer(middle.id, 1)
    expect(doc.layers.value.map((l) => l.name)).toEqual(['a', 'c', 'b'])
  })

  it('leaves the stack alone when a move would fall off either end', () => {
    const doc = useLiveryDocument()
    const only = fillLayer('a')
    doc.addLayer(only)
    doc.moveLayer(only.id, 1)
    doc.moveLayer(only.id, -1)
    doc.moveLayer('missing', 1)
    expect(doc.layers.value.map((l) => l.name)).toEqual(['a'])
  })

  /// Undo has to reach the last thing the user actually changed, not sit on a
  /// pile of entries that restore what is already on screen.
  it('spends no undo entry on a move that cannot happen', () => {
    const doc = useLiveryDocument()
    const only = fillLayer('a')
    doc.addLayer(only)
    doc.moveLayer(only.id, 1)

    doc.undo()

    expect(doc.layers.value).toEqual([])
  })

  it('patches a single layer', () => {
    const doc = useLiveryDocument()
    const layer = fillLayer('Base coat')
    doc.addLayer(layer)
    doc.updateLayer(layer.id, { visible: false, opacity: 0.5 })
    expect(doc.layers.value[0]).toMatchObject({ visible: false, opacity: 0.5 })
  })

  it('undoes and redoes a layer addition', () => {
    const doc = useLiveryDocument()
    doc.addLayer(fillLayer('Base coat'))
    expect(doc.canUndo.value).toBe(true)

    doc.undo()
    expect(doc.layers.value).toEqual([])
    expect(doc.selectedLayer.value).toBeNull()

    doc.redo()
    expect(doc.layers.value).toHaveLength(1)
  })

  it('collapses held edits into one undo step', () => {
    const doc = useLiveryDocument()
    const layer = fillLayer('Base coat')
    doc.addLayer(layer)

    doc.holdEdits()
    doc.updateLayer(layer.id, { opacity: 0.8 })
    doc.updateLayer(layer.id, { opacity: 0.2 })
    doc.releaseEdits()

    doc.undo()
    expect(doc.layers.value[0].opacity).toBe(1)
  })

  it('starts a fresh history for each opened texture', () => {
    const doc = useLiveryDocument()
    doc.addLayer(fillLayer('Base coat'))
    doc.init({ ...texture, id: 'tex2' } as Texture)
    expect(doc.canUndo.value).toBe(false)
    expect(doc.layers.value).toEqual([])
  })

  it('drops the document when the editor closes', () => {
    const doc = useLiveryDocument()
    doc.addLayer(fillLayer('Base coat'))
    doc.reset()
    expect(doc.document.value).toBeNull()
    expect(doc.layers.value).toEqual([])
  })

  it('ignores edits made with no document open', () => {
    const doc = useLiveryDocument()
    doc.reset()
    doc.addLayer(fillLayer('Base coat'))
    expect(doc.layers.value).toEqual([])
  })
})
