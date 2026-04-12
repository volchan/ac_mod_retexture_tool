import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { open } from '@tauri-apps/plugin-dialog'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
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
})

describe('ImportDropZone', () => {
  it('renders import label', () => {
    mockWebview()
    const wrapper = mount(ImportDropZone)
    expect(wrapper.text()).toContain('Import replacement textures')
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

  it('does not emit when drop has no paths', async () => {
    const { fire } = mockWebview()
    const wrapper = mount(ImportDropZone)
    await nextTick()
    fire({ type: 'drop', paths: [] })
    await nextTick()
    expect(wrapper.emitted('import')).toBeFalsy()
  })
})
