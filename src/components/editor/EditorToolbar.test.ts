import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useEditorTools } from '@/composables/useEditorTools'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import type { Texture } from '@/types/index'
import EditorToolbar from './EditorToolbar.vue'

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(async () => null) }))
vi.mock('@/lib/tauri', () => ({
  loadReplacementFull: vi.fn(async () => 'data:image/png;base64,A'),
}))

const texture = { id: 'tex1', name: 'skin_body.dds', width: 1024, height: 512 } as Texture

function buttonTitled(wrapper: ReturnType<typeof mount>, title: string) {
  const found = wrapper.findAll('button').find((b) => b.attributes('title') === title)
  if (!found) throw new Error(`No button titled ${title}`)
  return found
}

async function toolbar() {
  const wrapper = mount(EditorToolbar)
  await nextTick()
  return wrapper
}

describe('EditorToolbar', () => {
  beforeEach(() => {
    useLiveryDocument().init(texture)
    const tools = useEditorTools()
    tools.setTool('select')
    tools.mirrorX.value = false
    tools.mirrorY.value = false
  })

  it('arms the tool that was clicked', async () => {
    const wrapper = await toolbar()
    await buttonTitled(wrapper, 'Fill a region with a colour').trigger('click')
    expect(useEditorTools().tool.value).toBe('bucket')
  })

  it('offers the pipette alongside the paint tools', async () => {
    const wrapper = await toolbar()
    await buttonTitled(wrapper, 'Pick a colour off the livery').trigger('click')
    expect(useEditorTools().tool.value).toBe('eyedropper')
  })

  /// Mirroring duplicates a stroke as it is drawn, so it means nothing while the
  /// active tool cannot draw one.
  it('shows the mirror toggles only for the tools that paint strokes', async () => {
    const wrapper = await toolbar()
    expect(wrapper.vm.paintsStrokes).toBe(false)

    useEditorTools().setTool('brush')
    await nextTick()
    expect(wrapper.vm.paintsStrokes).toBe(true)
    expect(buttonTitled(wrapper, 'Mirror strokes left to right').exists()).toBe(true)

    useEditorTools().setTool('eraser')
    await nextTick()
    expect(wrapper.vm.paintsStrokes).toBe(true)
  })

  it('toggles a mirror axis on and back off', async () => {
    useEditorTools().setTool('brush')
    const wrapper = await toolbar()

    await buttonTitled(wrapper, 'Mirror strokes top to bottom').trigger('click')
    expect(useEditorTools().mirrorY.value).toBe(true)

    await buttonTitled(wrapper, 'Mirror strokes top to bottom').trigger('click')
    expect(useEditorTools().mirrorY.value).toBe(false)
  })

  it('adds a shape layer from its own button', async () => {
    const wrapper = await toolbar()
    await buttonTitled(wrapper, 'Add ellipse').trigger('click')

    const layer = useLiveryDocument().layers.value.at(-1)
    expect(layer).toMatchObject({ type: 'shape', shape: 'ellipse' })
  })

  it('adds a text layer from its own button', async () => {
    const wrapper = await toolbar()
    await buttonTitled(wrapper, 'Add text').trigger('click')
    expect(useLiveryDocument().layers.value.at(-1)?.type).toBe('text')
  })

  it('shows the brush size and colour only while the brush is held', async () => {
    const wrapper = await toolbar()
    expect(wrapper.find('input[type="color"]').exists()).toBe(false)

    useEditorTools().setTool('brush')
    await nextTick()
    expect(wrapper.find('input[title="Brush colour"]').exists()).toBe(true)
    expect(wrapper.find('input[title="Brush size"]').exists()).toBe(true)
  })

  /// The eraser takes a size but no colour: it removes pixels rather than laying any.
  it('offers the eraser a size but no colour', async () => {
    useEditorTools().setTool('eraser')
    const wrapper = await toolbar()

    expect(wrapper.find('input[title="Brush size"]').exists()).toBe(true)
    expect(wrapper.find('input[title="Brush colour"]').exists()).toBe(false)
  })

  it('shows the fill tolerance and colour only for the bucket', async () => {
    useEditorTools().setTool('bucket')
    const wrapper = await toolbar()

    expect(wrapper.find('input[title="Fill colour"]').exists()).toBe(true)
    expect(wrapper.text()).toContain(String(useEditorTools().fillTolerance.value))
  })

  it('writes the brush size back to the shared tool state', async () => {
    useEditorTools().setTool('brush')
    const wrapper = await toolbar()

    const size = wrapper.find('input[title="Brush size"]')
    await size.setValue('48')
    expect(useEditorTools().brushSize.value).toBe(48)
  })

  it('writes the fill tolerance back to the shared tool state', async () => {
    useEditorTools().setTool('bucket')
    const wrapper = await toolbar()

    await wrapper.find('input[type="range"]').setValue('120')
    expect(useEditorTools().fillTolerance.value).toBe(120)
  })
})
