import { open } from '@tauri-apps/plugin-dialog'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ImportDropZone from './ImportDropZone.vue'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => null),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ImportDropZone', () => {
  it('renders import label', () => {
    const wrapper = mount(ImportDropZone)
    expect(wrapper.text()).toContain('Import replacement textures')
  })

  it('emits import when folder selected via browse', async () => {
    vi.mocked(open).mockResolvedValueOnce('/some/folder')
    const wrapper = mount(ImportDropZone)
    await wrapper.trigger('click')
    await nextTick()
    expect(wrapper.emitted('import')).toEqual([['/some/folder']])
  })

  it('does not emit import when browse dialog is cancelled', async () => {
    vi.mocked(open).mockResolvedValueOnce(null)
    const wrapper = mount(ImportDropZone)
    await wrapper.trigger('click')
    await nextTick()
    expect(wrapper.emitted('import')).toBeFalsy()
  })

  it('applies drag-over styles on dragover', async () => {
    const wrapper = mount(ImportDropZone)
    await wrapper.trigger('dragover', { dataTransfer: { items: [] } })
    expect(wrapper.classes()).toContain('border-primary')
  })

  it('removes drag-over styles on dragleave', async () => {
    const wrapper = mount(ImportDropZone)
    await wrapper.trigger('dragover', { dataTransfer: { items: [] } })
    await wrapper.trigger('dragleave')
    expect(wrapper.classes()).not.toContain('border-primary')
  })

  it('emits path from drop when webkitGetAsEntry returns directory', async () => {
    const wrapper = mount(ImportDropZone)
    const fakeEntry = {
      isDirectory: true,
      fullPath: '/dropped/livery_pack',
      webkitGetAsEntry: undefined,
    }
    const fakeItem = { webkitGetAsEntry: () => fakeEntry }
    await wrapper.trigger('drop', {
      dataTransfer: {
        items: [fakeItem],
        files: [],
      },
    })
    await nextTick()
    expect(wrapper.emitted('import')).toEqual([['/dropped/livery_pack']])
  })
})
