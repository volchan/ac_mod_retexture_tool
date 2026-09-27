import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { open } from '@tauri-apps/plugin-dialog'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useLiveryEditor } from '@/composables/useLiveryEditor'
import type { Texture } from '@/types/index'
import ImportDropZone from './ImportDropZone.vue'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => null),
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(),
}))

type DragDropHandler = (event: { payload: { type: string; paths?: string[] } }) => void

function mockWebview() {
  let handler: DragDropHandler | null = null
  const webview = {
    onDragDropEvent: vi.fn(async (h: DragDropHandler) => {
      handler = h
      return () => {}
    }),
  }
  vi.mocked(getCurrentWebviewWindow).mockReturnValue(webview as never)
  return { webview, fire: (payload: { type: string; paths?: string[] }) => handler?.({ payload }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  useLiveryEditor().close()
})

describe('ImportDropZone', () => {
  it('renders import label', () => {
    mockWebview()
    const wrapper = mount(ImportDropZone)
    expect(wrapper.text()).toContain('Drop a folder of replacement textures')
  })

  it('emits import when folder selected via browse', async () => {
    mockWebview()
    vi.mocked(open).mockResolvedValueOnce('/some/folder')
    const wrapper = mount(ImportDropZone)
    await wrapper.trigger('click')
    await nextTick()
    expect(wrapper.emitted('import')).toEqual([['/some/folder']])
  })

  it('does not emit import when browse dialog is cancelled', async () => {
    mockWebview()
    vi.mocked(open).mockResolvedValueOnce(null)
    const wrapper = mount(ImportDropZone)
    await wrapper.trigger('click')
    await nextTick()
    expect(wrapper.emitted('import')).toBeFalsy()
  })

  it('applies drag-over styles on drag over event', async () => {
    const { fire } = mockWebview()
    const wrapper = mount(ImportDropZone)
    await nextTick()
    fire({ type: 'over' })
    await nextTick()
    expect(wrapper.classes()).toContain('border-primary')
  })

  it('removes drag-over styles on drag leave event', async () => {
    const { fire } = mockWebview()
    const wrapper = mount(ImportDropZone)
    await nextTick()
    fire({ type: 'over' })
    await nextTick()
    fire({ type: 'leave' })
    await nextTick()
    expect(wrapper.classes()).not.toContain('border-primary')
  })

  it('emits real OS path on drop event', async () => {
    const { fire } = mockWebview()
    const wrapper = mount(ImportDropZone)
    await nextTick()
    fire({ type: 'drop', paths: ['/Users/user/livery_pack'] })
    await nextTick()
    expect(wrapper.emitted('import')).toEqual([['/Users/user/livery_pack']])
  })

  /// The drop reaches every listener on the webview. With the editor open, the
  /// PNG is a new layer on the livery — reading it as a replacement too would
  /// swap out whichever texture shares its name.
  it('leaves a drop alone while the livery editor is open', async () => {
    const { fire } = mockWebview()
    const wrapper = mount(ImportDropZone)
    await nextTick()
    useLiveryEditor().open({ id: 'tex', name: 'body.dds' } as Texture, 'data:image/png;base64,AA')

    fire({ type: 'over' })
    fire({ type: 'drop', paths: ['/Users/user/sponsor.png'] })
    await nextTick()

    expect(wrapper.emitted('import')).toBeFalsy()
    expect(wrapper.vm.isDragOver).toBe(false)
  })

  it('does not emit when drop has no paths', async () => {
    const { fire } = mockWebview()
    const wrapper = mount(ImportDropZone)
    await nextTick()
    fire({ type: 'drop', paths: [] })
    await nextTick()
    expect(wrapper.emitted('import')).toBeFalsy()
  })
})
