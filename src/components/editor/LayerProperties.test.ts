import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import { bucketLayer, imageLayer, shapeLayer, textLayer } from '@/test-fixtures/layers'
import type { EditorLayer, Texture } from '@/types/index'
import LayerProperties from './LayerProperties.vue'

const texture = { id: 'tex1', name: 'skin_body.dds', width: 1024, height: 512 } as Texture

async function panelWith(layer: EditorLayer | null) {
  const doc = useLiveryDocument()
  doc.init(texture)
  if (layer) doc.addLayer(layer)
  const wrapper = mount(LayerProperties)
  await nextTick()
  return wrapper
}

function fieldTitled(wrapper: ReturnType<typeof mount>, title: string) {
  const found = wrapper.find(`[title="${title}"]`)
  if (!found.exists()) throw new Error(`No field titled ${title}`)
  return found
}

describe('LayerProperties', () => {
  beforeEach(() => {
    useLiveryDocument().reset()
  })

  it('shows nothing until a layer that has properties is selected', async () => {
    const wrapper = await panelWith(null)
    expect(wrapper.find('div').exists()).toBe(false)
  })

  it('offers no properties for a paint layer', async () => {
    const wrapper = await panelWith({ ...textLayer(), type: 'strokes', strokes: [] } as EditorLayer)
    expect(wrapper.find('div').exists()).toBe(false)
  })

  it('flips a placed layer on either axis without moving it', async () => {
    const wrapper = await panelWith(imageLayer())
    const [mirrorX, mirrorY] = wrapper.findAll('button')

    await mirrorX.trigger('click')
    expect(useLiveryDocument().layers.value[0]).toMatchObject({ scaleX: -1, x: 10 })

    await mirrorY.trigger('click')
    expect(useLiveryDocument().layers.value[0]).toMatchObject({ scaleY: -1, y: 20 })
  })

  it('leaves a bucket alone: it has no placement to mirror', async () => {
    const wrapper = await panelWith(bucketLayer())
    expect(wrapper.vm.placed).toBeNull()
    wrapper.vm.mirror('x')
    expect(useLiveryDocument().layers.value[0]).toMatchObject({ x: 100, y: 100 })
  })

  it('edits the text of a text layer', async () => {
    const wrapper = await panelWith(textLayer())
    await wrapper.find('input[placeholder="Text"]').setValue('Verde')
    expect(useLiveryDocument().layers.value[0]).toMatchObject({ value: 'Verde' })
  })

  it('reads the numeric text fields back as numbers', async () => {
    const wrapper = await panelWith(textLayer())
    await fieldTitled(wrapper, 'Font size').setValue('96')
    await fieldTitled(wrapper, 'Outline width').setValue('4')

    expect(useLiveryDocument().layers.value[0]).toMatchObject({ fontSize: 96, strokeWidth: 4 })
  })

  it('bends the baseline of a text layer', async () => {
    const wrapper = await panelWith(textLayer())
    await wrapper.find('input[type="range"]').setValue('-45')
    expect(useLiveryDocument().layers.value[0]).toMatchObject({ curve: -45 })
  })

  it('picks a font from the families the machine offers', async () => {
    const wrapper = await panelWith(textLayer())
    await fieldTitled(wrapper, 'Font').setValue('Georgia')
    expect(useLiveryDocument().layers.value[0]).toMatchObject({ fontFamily: 'Georgia' })
  })

  it('shows a corner radius for a rectangle and none for an ellipse', async () => {
    const rect = await panelWith(shapeLayer())
    expect(rect.find('[title="Corner radius"]').exists()).toBe(true)

    const ellipse = await panelWith(shapeLayer({ shape: 'ellipse' }))
    expect(ellipse.find('[title="Corner radius"]').exists()).toBe(false)
  })

  it('edits the outline width of a shape', async () => {
    const wrapper = await panelWith(shapeLayer())
    await fieldTitled(wrapper, 'Outline width').setValue('6')
    expect(useLiveryDocument().layers.value[0]).toMatchObject({ strokeWidth: 6 })
  })

  it('changes the blend mode of a fill', async () => {
    const wrapper = await panelWith(bucketLayer())
    await fieldTitled(wrapper, 'Blend mode').setValue('multiply')
    expect(useLiveryDocument().layers.value[0]).toMatchObject({ blend: 'multiply' })
  })

  it('changes the tolerance of a fill', async () => {
    const wrapper = await panelWith(bucketLayer())
    await fieldTitled(wrapper, "How far a pixel's colour may differ from the one clicked").setValue(
      '90',
    )
    expect(useLiveryDocument().layers.value[0]).toMatchObject({ tolerance: 90 })
  })

  /// A slider fires on every pixel of travel. Unheld, undo would walk the drag
  /// back tick by tick instead of reaching the value the user started from.
  it('lands a whole slider drag as one undo entry', async () => {
    const wrapper = await panelWith(bucketLayer())
    const slider = fieldTitled(wrapper, "How far a pixel's colour may differ from the one clicked")

    await slider.trigger('pointerdown')
    for (const value of ['40', '60', '80']) {
      await slider.setValue(value)
    }
    await slider.trigger('pointerup')

    const doc = useLiveryDocument()
    expect(doc.layers.value[0]).toMatchObject({ tolerance: 80 })
    doc.undo()
    expect(doc.layers.value[0]).toMatchObject({ tolerance: 32 })

    // One more step reaches the layer's creation: the drag spent a single entry.
    doc.undo()
    expect(doc.layers.value).toEqual([])
  })

  it('holds the same way for the keyboard, which never sends a pointer event', async () => {
    const wrapper = await panelWith(textLayer())
    const size = fieldTitled(wrapper, 'Font size')

    await size.trigger('focus')
    await size.setValue('70')
    await size.setValue('80')
    await size.trigger('blur')

    const doc = useLiveryDocument()
    doc.undo()
    expect(doc.layers.value[0]).toMatchObject({ fontSize: 64 })
  })
})
