import { getCurrentWebview } from '@tauri-apps/api/webview'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useEditorTools } from '@/composables/useEditorTools'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import { useLiveryEditor } from '@/composables/useLiveryEditor'
import { imageLayer, textLayer } from '@/test-fixtures/layers'
import type { Texture } from '@/types/index'
import LiveryEditor from './LiveryEditor.vue'

const mocks = vi.hoisted(() => ({
  save: vi.fn(async () => undefined),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))

vi.mock('@/composables/useLiveryPersistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useLiveryPersistence')>()
  return {
    ...actual,
    useLiveryPersistence: () => ({ ...actual.useLiveryPersistence(), save: mocks.save }),
  }
})

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(async () => null) }))

// A dropped file reaches the webview as a data URL from the backend, never as a path.
vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>()
  return { ...actual, loadReplacementFull: vi.fn(async () => 'data:image/png;base64,AAA') }
})

const texture = {
  id: 'tex1',
  name: 'skin_body.dds',
  path: '/mods/car/car.kn5',
  width: 1024,
  height: 512,
} as Texture

// jsdom never loads an image, so nothing would resolve the base texture probe.
class StubImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 1024
  naturalHeight = 512
  set src(_value: string) {
    queueMicrotask(() => (decodeFails ? this.onerror?.() : this.onload?.()))
  }
}

/// Flipped by the tests that need a base texture the webview refuses to decode.
let decodeFails = false

const STUBS = {
  EditorToolbar: true,
  LayerPanel: true,
  CarPreview: true,
  EditorCanvas: { template: '<div />', methods: { getStage: () => ({}) } },
}

async function editor() {
  const wrapper = mount(LiveryEditor, { global: { stubs: STUBS } })
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
  return wrapper
}

function press(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
}

describe('LiveryEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('Image', StubImage)
    decodeFails = false
    useLiveryEditor().close()
    useLiveryDocument().reset()
    useEditorTools().setTool('select')
    useLiveryEditor().open(texture, 'data:image/png;base64,AAA')
    // The editor's own watcher only fires on a change, and the texture is opened
    // before it mounts, so the document is seeded here instead.
    useLiveryDocument().init(texture)
  })

  it('renders nothing while no texture is open', async () => {
    useLiveryEditor().close()
    const wrapper = await editor()
    expect(wrapper.find('header').exists()).toBe(false)
  })

  it('names the texture it is editing and its size', async () => {
    const wrapper = await editor()
    expect(wrapper.text()).toContain('skin_body.dds')
    expect(wrapper.text()).toContain('1024×512')
  })

  /// Saving flattens the stage, so a click during the frames the base texture is
  /// still decoding would write an empty edit over a real texture.
  it('holds Save shut until the base texture has decoded', async () => {
    const wrapper = mount(LiveryEditor, { global: { stubs: STUBS } })
    expect(wrapper.vm.canSave).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    expect(wrapper.vm.canSave).toBe(true)
  })

  it('leaves Save shut and says why when the texture will not decode', async () => {
    decodeFails = true
    const wrapper = await editor()

    expect(wrapper.vm.canSave).toBe(false)
    expect(wrapper.vm.baseImage).toBeNull()
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('skin_body.dds'))
  })

  it('refuses to save while it cannot', async () => {
    decodeFails = true
    const wrapper = await editor()
    await wrapper.vm.handleSave()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('saves, says so and closes the editor', async () => {
    const wrapper = await editor()
    await wrapper.vm.handleSave()

    expect(mocks.save).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Saved skin_body.dds')
    expect(useLiveryEditor().texture.value).toBeNull()
  })

  it('reports a failed save and stays open', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Disk full'))
    const wrapper = await editor()
    await wrapper.vm.handleSave()

    expect(mocks.toastError).toHaveBeenCalledWith('Disk full')
    expect(useLiveryEditor().texture.value).not.toBeNull()
  })

  it('closes on Escape', async () => {
    await editor()
    press('Escape')
    expect(useLiveryEditor().texture.value).toBeNull()
  })

  it('deletes the selected layer on Backspace and on Delete', async () => {
    await editor()
    const doc = useLiveryDocument()

    doc.addLayer(imageLayer({ id: 'a' }))
    press('Backspace')
    expect(doc.layers.value).toEqual([])

    doc.addLayer(textLayer({ id: 'b' }))
    press('Delete')
    expect(doc.layers.value).toEqual([])
  })

  it('leaves the stack alone when nothing is selected', async () => {
    await editor()
    const doc = useLiveryDocument()
    doc.addLayer(imageLayer({ id: 'a' }))
    doc.select(null)

    press('Backspace')
    expect(doc.layers.value).toHaveLength(1)
  })

  /// Backspace belongs to the word being typed, not to the selected layer.
  it('lets a shortcut through to the field the caret is in', async () => {
    await editor()
    const doc = useLiveryDocument()
    doc.addLayer(imageLayer({ id: 'a' }))

    const field = document.createElement('input')
    document.body.appendChild(field)
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))

    expect(doc.layers.value).toHaveLength(1)
    expect(useLiveryEditor().texture.value).not.toBeNull()
    field.remove()
  })

  it('undoes and redoes from the keyboard', async () => {
    await editor()
    const doc = useLiveryDocument()
    doc.addLayer(imageLayer({ id: 'a' }))

    press('z', { metaKey: true })
    expect(doc.layers.value).toEqual([])

    press('z', { metaKey: true, shiftKey: true })
    expect(doc.layers.value).toHaveLength(1)

    press('z', { ctrlKey: true })
    expect(doc.layers.value).toEqual([])

    press('y', { ctrlKey: true })
    expect(doc.layers.value).toHaveLength(1)
  })

  it('ignores a letter pressed without the modifier', async () => {
    await editor()
    const doc = useLiveryDocument()
    doc.addLayer(imageLayer({ id: 'a' }))

    press('z')
    expect(doc.layers.value).toHaveLength(1)
  })

  it('adds every dropped image and skips the files that are not one', async () => {
    let drop: ((event: unknown) => void) | undefined
    vi.mocked(getCurrentWebview).mockReturnValueOnce({
      onDragDropEvent: vi.fn(async (handler: (event: unknown) => void) => {
        drop = handler
        return () => {}
      }),
    } as never)

    await editor()
    await drop?.({ payload: { type: 'drop', paths: ['/a/logo.png', '/a/notes.txt'] } })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const layers = useLiveryDocument().layers.value
    expect(layers).toHaveLength(1)
    expect(layers[0].name).toBe('logo.png')
  })

  it('ignores a drag that never became a drop', async () => {
    let drop: ((event: unknown) => void) | undefined
    vi.mocked(getCurrentWebview).mockReturnValueOnce({
      onDragDropEvent: vi.fn(async (handler: (event: unknown) => void) => {
        drop = handler
        return () => {}
      }),
    } as never)

    await editor()
    await drop?.({ payload: { type: 'over', paths: ['/a/logo.png'] } })
    expect(useLiveryDocument().layers.value).toEqual([])
  })

  /// The listener is registered on the webview, which outlives this component:
  /// closing the editor before it resolves leaves nothing to detach, and drops
  /// keep injecting layers into a closed document.
  it('detaches a drop listener that only resolved after it unmounted', async () => {
    const stop = vi.fn()
    let release: (() => void) | undefined
    vi.mocked(getCurrentWebview).mockReturnValueOnce({
      onDragDropEvent: vi.fn(
        () => new Promise((resolve) => (release = () => resolve(stop as never))),
      ),
    } as never)

    const wrapper = mount(LiveryEditor, { global: { stubs: STUBS } })
    await nextTick()
    wrapper.unmount()

    release?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(stop).toHaveBeenCalledOnce()
  })

  it('surfaces a failed image import once, then clears it', async () => {
    const wrapper = await editor()
    useEditorTools().imageError.value = 'Could not read broken.png'
    await nextTick()

    expect(mocks.toastError).toHaveBeenCalledWith('Could not read broken.png')
    expect(useEditorTools().imageError.value).toBeNull()
    expect(wrapper.vm.texture).not.toBeNull()
  })

  it('reports the zoom as a percentage and refits on demand', async () => {
    const wrapper = await editor()
    expect(wrapper.vm.zoomPercent).toBe(Math.round(wrapper.vm.effectiveScale * 100))

    wrapper.vm.zoomFromButton(1)
    await nextTick()
    const zoomed = wrapper.vm.effectiveScale

    wrapper.vm.resetView()
    await nextTick()
    expect(wrapper.vm.effectiveScale).not.toBe(zoomed)
  })

  it('zooms on the wheel rather than scrolling the page', async () => {
    const wrapper = await editor()
    const prevented = vi.fn()
    wrapper.vm.handleWheel({
      preventDefault: prevented,
      deltaY: -1,
      clientX: 0,
      clientY: 0,
    } as never)
    expect(prevented).toHaveBeenCalled()
  })

  it('maps a hover on the car onto a pixel of the sheet', async () => {
    const wrapper = await editor()
    wrapper.vm.hover = { u: 0.5, v: 0.25 } as never
    await nextTick()
    expect(wrapper.vm.hoverPoint).toEqual({ x: 512, y: 128 })
  })

  it('has no hover point while the cursor is off the car', async () => {
    const wrapper = await editor()
    expect(wrapper.vm.hoverPoint).toBeNull()
  })
})
