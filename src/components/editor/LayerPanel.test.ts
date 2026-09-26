import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import { bucketLayer, imageLayer, shapeLayer, strokeLayer, textLayer } from '@/test-fixtures/layers'
import type { EditorLayer, Texture } from '@/types/index'
import LayerPanel from './LayerPanel.vue'

const texture = { id: 'tex1', name: 'skin_body.dds', width: 1024, height: 512 } as Texture

async function panelWith(layers: EditorLayer[]) {
  const doc = useLiveryDocument()
  doc.init(texture)
  for (const layer of layers) doc.addLayer(layer)
  doc.select(null)
  const wrapper = mount(LayerPanel)
  await nextTick()
  return wrapper
}

function rowTitled(wrapper: ReturnType<typeof mount>, index: number, title: string) {
  const row = wrapper.findAll('li')[index]
  const found = row.findAll('button').find((b) => b.attributes('title') === title)
  if (!found) throw new Error(`No ${title} in row ${index}`)
  return found
}

describe('LayerPanel', () => {
  beforeEach(() => {
    useLiveryDocument().reset()
  })

  it('says so when nothing has been added yet', async () => {
    const wrapper = await panelWith([])
    expect(wrapper.text()).toContain('Nothing on top of the base texture yet.')
  })

  /// The stack renders bottom-up but every editor reads it top-down.
  it('lists the topmost layer first', async () => {
    const wrapper = await panelWith([
      imageLayer({ id: 'bottom', name: 'Bottom' }),
      textLayer({ id: 'top', name: 'Top' }),
    ])
    expect(wrapper.findAll('li').map((li) => li.text())).toEqual([
      expect.stringContaining('Top'),
      expect.stringContaining('Bottom'),
    ])
  })

  it('selects the layer that was clicked', async () => {
    const wrapper = await panelWith([imageLayer({ id: 'a' }), textLayer({ id: 'b' })])
    await wrapper.findAll('li')[1].trigger('click')
    expect(useLiveryDocument().selectedId.value).toBe('a')
  })

  it('hides and shows a layer without selecting it', async () => {
    const wrapper = await panelWith([imageLayer({ id: 'a' })])
    await rowTitled(wrapper, 0, 'Hide layer').trigger('click')

    expect(useLiveryDocument().layers.value[0].visible).toBe(false)
    expect(useLiveryDocument().selectedId.value).toBeNull()
    await nextTick()
    expect(rowTitled(wrapper, 0, 'Show layer').exists()).toBe(true)
  })

  it('moves a layer up the stack', async () => {
    const wrapper = await panelWith([imageLayer({ id: 'a' }), textLayer({ id: 'b' })])
    await rowTitled(wrapper, 1, 'Move up').trigger('click')
    expect(useLiveryDocument().layers.value.map((l) => l.id)).toEqual(['b', 'a'])
  })

  it('moves a layer down the stack', async () => {
    const wrapper = await panelWith([imageLayer({ id: 'a' }), textLayer({ id: 'b' })])
    await rowTitled(wrapper, 0, 'Move down').trigger('click')
    expect(useLiveryDocument().layers.value.map((l) => l.id)).toEqual(['b', 'a'])
  })

  it('deletes a layer', async () => {
    const wrapper = await panelWith([imageLayer({ id: 'a' }), textLayer({ id: 'b' })])
    await rowTitled(wrapper, 0, 'Delete layer').trigger('click')
    expect(useLiveryDocument().layers.value.map((l) => l.id)).toEqual(['a'])
  })

  it('shows an icon for every kind of layer it can hold', async () => {
    const wrapper = await panelWith([
      imageLayer({ id: 'a' }),
      textLayer({ id: 'b' }),
      shapeLayer({ id: 'c' }),
      bucketLayer({ id: 'd' }),
      strokeLayer({ id: 'e' }),
    ])
    expect(wrapper.findAll('li')).toHaveLength(5)
    expect(wrapper.findAll('li svg').length).toBeGreaterThanOrEqual(5)
  })

  it('offers opacity only once a layer is selected', async () => {
    const wrapper = await panelWith([imageLayer({ id: 'a', opacity: 0.4 })])
    expect(wrapper.find('input[type="range"]').exists()).toBe(false)

    useLiveryDocument().select('a')
    await nextTick()
    expect(wrapper.text()).toContain('40%')
  })

  it('writes opacity back as a fraction, not a percentage', async () => {
    const wrapper = await panelWith([imageLayer({ id: 'a' })])
    useLiveryDocument().select('a')
    await nextTick()

    await wrapper.find('input[type="range"]').setValue('25')
    expect(useLiveryDocument().layers.value[0].opacity).toBe(0.25)
  })

  /// Dragging the slider fires on every pixel of travel; each tick unheld is its
  /// own undo entry, so undo would crawl back through the drag.
  it('lands a whole opacity drag as one undo entry', async () => {
    const wrapper = await panelWith([imageLayer({ id: 'a' })])
    useLiveryDocument().select('a')
    await nextTick()

    const slider = wrapper.find('input[type="range"]')
    await slider.trigger('pointerdown')
    for (const value of ['80', '60', '40']) {
      await slider.setValue(value)
    }
    await slider.trigger('pointerup')

    const doc = useLiveryDocument()
    expect(doc.layers.value[0].opacity).toBe(0.4)
    doc.undo()
    expect(doc.layers.value[0].opacity).toBe(1)

    doc.undo()
    expect(doc.layers.value).toEqual([])
  })
})
