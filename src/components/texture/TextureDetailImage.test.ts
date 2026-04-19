import { clearInvokeHandlers, mockInvokeHandler } from '@tauri-apps/api'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useTextureDetail } from '@/composables/useTextureDetail'
import type { Texture } from '@/types/index'
import TextureDetailImage from './TextureDetailImage.vue'

function makeTexture(overrides: Partial<Texture> = {}): Texture {
  return {
    id: 'tex1',
    name: 'body.dds',
    path: '/mods/car.kn5',
    source: 'kn5',
    kn5File: '/mods/car.kn5',
    category: 'body',
    width: 1024,
    height: 1024,
    format: 'BC3',
    previewUrl: 'data:image/png;base64,abc',
    isDecoded: true,
    ...overrides,
  }
}

async function flushAll() {
  await vi.runAllTimersAsync()
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers()
  clearInvokeHandlers()
  useTextureDetail().close()
})

afterEach(() => {
  useTextureDetail().close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('TextureDetailImage', () => {
  it('shows spinner while loading original', async () => {
    let resolveLoad!: (v: string) => void
    mockInvokeHandler(
      'get_kn5_texture',
      () =>
        new Promise((r) => {
          resolveLoad = r
        }),
    )
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await nextTick()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    expect(wrapper.find('.animate-spin').exists()).toBe(true)
    expect(wrapper.text()).toContain('Loading texture')
    await vi.runAllTimersAsync()
    resolveLoad('data:image/png;base64,x')
    await flushPromises()
    wrapper.unmount()
  })

  it('shows original image once loaded', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('data:image/png;base64,full')
    wrapper.unmount()
  })

  it('shows error state when load fails', async () => {
    mockInvokeHandler('get_kn5_texture', () => {
      throw new Error('decode failed')
    })
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    expect(wrapper.text()).toContain('decode failed')
    wrapper.unmount()
  })

  it('retry button calls setTab to trigger reload', async () => {
    let callCount = 0
    mockInvokeHandler('get_kn5_texture', () => {
      callCount++
      if (callCount === 1) throw new Error('first fail')
      return 'data:image/png;base64,full'
    })
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    expect(wrapper.text()).toContain('first fail')

    const retryBtn = wrapper.findAll('button').find((b) => b.text() === 'Retry')
    await retryBtn?.trigger('click')
    await flushAll()

    expect(callCount).toBe(2)
    wrapper.unmount()
  })

  it('shows replacement image tab when replacement exists', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,orig')
    const tex = makeTexture({
      id: 'tex1',
      replacement: {
        sourcePath: '/import/body.png',
        previewUrl: 'data:image/png;base64,rep',
        width: 1024,
        height: 1024,
      },
    })
    useTextureDetail().open(tex.id, [tex])
    await nextTick()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    expect(wrapper.find('[data-testid="tab-strip"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('original')
    expect(wrapper.text()).toContain('replacement')
    wrapper.unmount()
  })

  it('hides tab strip when no replacement', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,orig')
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    expect(wrapper.find('[data-testid="tab-strip"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('no image rendered when activeTexture has no replacement and no original loaded', async () => {
    mockInvokeHandler('get_kn5_texture', () => new Promise(() => {}))
    const texWithReplacement = makeTexture({
      id: 'tex1',
      replacement: {
        sourcePath: '/import/body.png',
        previewUrl: 'data:image/png;base64,rep',
        width: 1024,
        height: 1024,
      },
    })
    useTextureDetail().open(texWithReplacement.id, [texWithReplacement])
    await nextTick()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    useTextureDetail().close()
    await nextTick()

    expect(wrapper.find('img').exists()).toBe(false)
    wrapper.unmount()
  })

  it('clicking Replacement tab shows replacement image', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,orig')
    const tex = makeTexture({
      id: 'tex1',
      replacement: {
        sourcePath: '/import/body.png',
        previewUrl: 'data:image/png;base64,rep',
        width: 1024,
        height: 1024,
      },
    })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    const tabs = wrapper.findAll('button')
    const repTab = tabs.find((b) => b.text() === 'replacement')
    await repTab?.trigger('click')
    await nextTick()

    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toContain('/import/body.png')
    wrapper.unmount()
  })

  it('zoom controls are always visible', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    expect(wrapper.find('button[title="Zoom in"]').exists()).toBe(true)
    expect(wrapper.find('button[title="Zoom out"]').exists()).toBe(true)
    expect(wrapper.find('button[title="Reset zoom"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('zoomIn increases zoom level', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    const before = wrapper.vm.zoom
    await wrapper.find('button[title="Zoom in"]').trigger('click')
    expect(wrapper.vm.zoom).toBeGreaterThan(before)
    wrapper.unmount()
  })

  it('zoomOut decreases zoom level', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    const before = wrapper.vm.zoom
    await wrapper.find('button[title="Zoom out"]').trigger('click')
    expect(wrapper.vm.zoom).toBeLessThan(before)
    wrapper.unmount()
  })

  it('resetView button resets zoom and offset', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    wrapper.vm.zoomIn()
    wrapper.vm.onMouseDown(new MouseEvent('mousedown', { clientX: 10, clientY: 20 }))
    wrapper.vm.onMouseMove(new MouseEvent('mousemove', { clientX: 50, clientY: 80 }))
    wrapper.vm.onMouseUp()

    await wrapper.find('button[title="Reset zoom"]').trigger('click')
    expect(wrapper.vm.zoom).toBe(1)
    expect(wrapper.vm.offsetX).toBe(0)
    expect(wrapper.vm.offsetY).toBe(0)
    wrapper.unmount()
  })

  it('zoom resets when active texture changes', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')
    const texA = makeTexture({ id: 'a' })
    const texB = makeTexture({ id: 'b' })
    useTextureDetail().open('a', [texA, texB])
    await flushAll()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    wrapper.vm.zoomIn()
    expect(wrapper.vm.zoom).toBeGreaterThan(1)

    useTextureDetail().navigate('next')
    await nextTick()

    expect(wrapper.vm.zoom).toBe(1)
    wrapper.unmount()
  })

  it('onWheel zooms in on scroll up', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage, { attachTo: document.body })
    await nextTick()

    const before = wrapper.vm.zoom
    wrapper.vm.onWheel(
      new WheelEvent('wheel', { deltaY: -100, clientX: 0, clientY: 0, bubbles: true }),
    )
    expect(wrapper.vm.zoom).toBeGreaterThan(before)
    wrapper.unmount()
  })

  it('onWheel zooms out on scroll down', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage, { attachTo: document.body })
    await nextTick()

    const before = wrapper.vm.zoom
    wrapper.vm.onWheel(
      new WheelEvent('wheel', { deltaY: 100, clientX: 0, clientY: 0, bubbles: true }),
    )
    expect(wrapper.vm.zoom).toBeLessThan(before)
    wrapper.unmount()
  })

  it('drag pans the image', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    wrapper.vm.onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }))
    expect(wrapper.vm.isDragging).toBe(true)
    await nextTick()

    wrapper.vm.onMouseMove(new MouseEvent('mousemove', { clientX: 150, clientY: 160 }))
    expect(wrapper.vm.offsetX).toBe(50)
    expect(wrapper.vm.offsetY).toBe(60)

    wrapper.vm.onMouseUp()
    expect(wrapper.vm.isDragging).toBe(false)
    wrapper.unmount()
  })

  it('onMouseDown with non-primary button does not start drag', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    wrapper.vm.onMouseDown(new MouseEvent('mousedown', { button: 2, clientX: 0, clientY: 0 }))
    expect(wrapper.vm.isDragging).toBe(false)
    wrapper.unmount()
  })

  it('onMouseMove does nothing when not dragging', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')
    const tex = makeTexture({ id: 'tex1' })
    useTextureDetail().open(tex.id, [tex])
    await flushAll()

    const wrapper = mount(TextureDetailImage)
    await nextTick()

    wrapper.vm.onMouseMove(new MouseEvent('mousemove', { clientX: 200, clientY: 200 }))
    expect(wrapper.vm.offsetX).toBe(0)
    expect(wrapper.vm.offsetY).toBe(0)
    wrapper.unmount()
  })
})
