import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { open } from '@tauri-apps/plugin-dialog'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ModDropZone from './ModDropZone.vue'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => null),
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({
    onDragDropEvent: vi.fn(async () => () => {}),
  })),
}))

type DragDropCallback = (event: { payload: { type: string; paths: string[] } }) => void

function makeDragMock() {
  let capturedCallback: DragDropCallback | null = null
  const onDragDropEvent = vi.fn(async (cb: DragDropCallback) => {
    capturedCallback = cb
    return () => {}
  })
  vi.mocked(getCurrentWebviewWindow).mockReturnValue({
    onDragDropEvent,
  } as ReturnType<typeof getCurrentWebviewWindow>)
  return {
    trigger: (payload: { type: string; paths: string[] }) => {
      capturedCallback?.({ payload })
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ModDropZone', () => {
  it('renders the drop zone with correct text', () => {
    const wrapper = mount(ModDropZone)
    expect(wrapper.text()).toContain('Drop mod folder here')
    expect(wrapper.text()).toContain('or click to browse')
    wrapper.unmount()
  })

  it('emits drop event when a folder is dropped', async () => {
    const { trigger } = makeDragMock()
    const wrapper = mount(ModDropZone)
    await nextTick()

    trigger({ type: 'drop', paths: ['/mods/my_car'] })
    await nextTick()

    expect(wrapper.emitted('drop')).toBeTruthy()
    expect(wrapper.emitted('drop')?.[0]).toEqual(['/mods/my_car'])
    wrapper.unmount()
  })

  it('does not emit drop when paths is empty', async () => {
    const { trigger } = makeDragMock()
    const wrapper = mount(ModDropZone)
    await nextTick()

    trigger({ type: 'drop', paths: [] })
    await nextTick()

    expect(wrapper.emitted('drop')).toBeFalsy()
    wrapper.unmount()
  })

  it('sets isDraggingOver on drag over event', async () => {
    const { trigger } = makeDragMock()
    const wrapper = mount(ModDropZone)
    await nextTick()

    trigger({ type: 'over', paths: [] })
    await nextTick()

    expect(wrapper.find('div').classes()).toContain('border-primary')
    wrapper.unmount()
  })

  it('clears isDraggingOver on drag leave event', async () => {
    const { trigger } = makeDragMock()
    const wrapper = mount(ModDropZone)
    await nextTick()

    trigger({ type: 'over', paths: [] })
    await nextTick()
    trigger({ type: 'leave', paths: [] })
    await nextTick()

    expect(wrapper.find('div').classes()).not.toContain('border-primary')
    wrapper.unmount()
  })

  it('clears isDraggingOver on drop', async () => {
    const { trigger } = makeDragMock()
    const wrapper = mount(ModDropZone)
    await nextTick()

    trigger({ type: 'over', paths: [] })
    await nextTick()
    trigger({ type: 'drop', paths: ['/mods/car'] })
    await nextTick()

    expect(wrapper.find('div').classes()).not.toContain('border-primary')
    wrapper.unmount()
  })

  it('opens dialog and emits drop on click when folder selected', async () => {
    vi.mocked(open).mockResolvedValueOnce('/mods/selected_car')
    const wrapper = mount(ModDropZone)
    await nextTick()

    await wrapper.find('div').trigger('click')
    await nextTick()

    expect(open).toHaveBeenCalledWith({ directory: true, multiple: false })
    expect(wrapper.emitted('drop')?.[0]).toEqual(['/mods/selected_car'])
    wrapper.unmount()
  })

  it('does not emit drop when dialog is cancelled', async () => {
    vi.mocked(open).mockResolvedValueOnce(null)
    const wrapper = mount(ModDropZone)
    await nextTick()

    await wrapper.find('div').trigger('click')
    await nextTick()

    expect(wrapper.emitted('drop')).toBeFalsy()
    wrapper.unmount()
  })

  it('calls unlisten on unmount', async () => {
    const unlisten = vi.fn()
    const onDragDropEvent = vi.fn(async () => unlisten)
    vi.mocked(getCurrentWebviewWindow).mockReturnValue({
      onDragDropEvent,
    } as ReturnType<typeof getCurrentWebviewWindow>)

    const wrapper = mount(ModDropZone)
    await nextTick()

    wrapper.unmount()
    expect(unlisten).toHaveBeenCalled()
  })
})
