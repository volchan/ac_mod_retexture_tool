import { clearInvokeHandlers, mockInvokeHandler } from '@tauri-apps/api'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useTextureDetail } from '@/composables/useTextureDetail'
import type { Texture } from '@/types/index'
import TextureDetailMeta from './TextureDetailMeta.vue'

function makeTexture(overrides: Partial<Texture> = {}): Texture {
  return {
    id: 'tex1',
    name: 'body.dds',
    path: '/mods/car.kn5',
    source: 'kn5',
    kn5File: '/mods/ferrari/car.kn5',
    skinFolder: undefined,
    category: 'body',
    width: 1024,
    height: 1024,
    format: 'BC3',
    previewUrl: 'data:image/png;base64,abc',
    isDecoded: true,
    ...overrides,
  }
}

beforeEach(() => {
  clearInvokeHandlers()
  mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')
  useTextureDetail().close()
})

afterEach(() => {
  useTextureDetail().close()
  vi.restoreAllMocks()
})

describe('TextureDetailMeta', () => {
  it('shows texture name, dimensions, format and source', async () => {
    const tex = makeTexture({ name: 'door_left.dds', width: 512, height: 256, format: 'BC1' })
    useTextureDetail().open(tex.id, [tex])
    await nextTick()

    const wrapper = mount(TextureDetailMeta)
    await nextTick()

    expect(wrapper.text()).toContain('door_left.dds')
    expect(wrapper.text()).toContain('512×256')
    expect(wrapper.text()).toContain('BC1')
    expect(wrapper.text()).toContain('/mods/ferrari/car.kn5')
    wrapper.unmount()
  })

  it('shows skinFolder as source when kn5File is absent', async () => {
    const tex = makeTexture({ kn5File: undefined, skinFolder: '0_default', source: 'skin' })
    useTextureDetail().open(tex.id, [tex])
    await nextTick()

    const wrapper = mount(TextureDetailMeta)
    await nextTick()

    expect(wrapper.text()).toContain('0_default')
    wrapper.unmount()
  })

  it('shows — when neither kn5File nor skinFolder', async () => {
    const tex = makeTexture({ kn5File: undefined, skinFolder: undefined })
    useTextureDetail().open(tex.id, [tex])
    await nextTick()

    const wrapper = mount(TextureDetailMeta)
    await nextTick()

    expect(wrapper.text()).toContain('—')
    wrapper.unmount()
  })

  it('shows replacement block when replacement exists', async () => {
    const tex = makeTexture({
      replacement: {
        sourcePath: '/import/door_left.png',
        previewUrl: 'data:image/png;base64,rep',
        width: 1024,
        height: 1024,
      },
    })
    useTextureDetail().open(tex.id, [tex])
    await nextTick()

    const wrapper = mount(TextureDetailMeta)
    await nextTick()

    expect(wrapper.text()).toContain('Replacement')
    expect(wrapper.text()).toContain('/import/door_left.png')
    expect(wrapper.text()).toContain('1024×1024')
    wrapper.unmount()
  })

  it('hides replacement block when no replacement', async () => {
    const tex = makeTexture()
    useTextureDetail().open(tex.id, [tex])
    await nextTick()

    const wrapper = mount(TextureDetailMeta)
    await nextTick()

    expect(wrapper.text()).not.toContain('Replacement')
    wrapper.unmount()
  })
})
