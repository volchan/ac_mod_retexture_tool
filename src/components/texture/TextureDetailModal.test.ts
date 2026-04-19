import { clearInvokeHandlers, mockInvokeHandler } from '@tauri-apps/api'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useTextureDetail } from '@/composables/useTextureDetail'
import type { Texture } from '@/types/index'
import TextureDetailModal from './TextureDetailModal.vue'

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

function queryDialog() {
  return document.body.querySelector('[role="dialog"]')
}

beforeEach(() => {
  vi.useFakeTimers()
  clearInvokeHandlers()
  mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')
  useTextureDetail().close()
})

afterEach(() => {
  useTextureDetail().close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('TextureDetailModal', () => {
  it('renders nothing when no activeTexture', async () => {
    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await nextTick()

    expect(queryDialog()).toBeNull()
    wrapper.unmount()
  })

  it('renders dialog when activeTexture is set', async () => {
    const tex = makeTexture()
    useTextureDetail().open(tex.id, [tex])
    await nextTick()

    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await nextTick()

    expect(queryDialog()).not.toBeNull()
    wrapper.unmount()
  })

  it('shows texture name in metadata panel', async () => {
    const tex = makeTexture({ name: 'my_special_texture.dds' })
    useTextureDetail().open(tex.id, [tex])
    await nextTick()

    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await flushPromises()

    expect(document.body.textContent).toContain('my_special_texture.dds')
    wrapper.unmount()
  })

  it('hides dialog after close', async () => {
    const tex = makeTexture()
    useTextureDetail().open(tex.id, [tex])
    await nextTick()

    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await nextTick()

    useTextureDetail().close()
    await nextTick()

    expect(queryDialog()).toBeNull()
    wrapper.unmount()
  })

  it('left nav arrow absent when hasPrev is false', async () => {
    const list = [makeTexture({ id: 'a' }), makeTexture({ id: 'b' })]
    useTextureDetail().open('a', list)
    await nextTick()

    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await nextTick()

    const dialog = queryDialog()
    expect(dialog).not.toBeNull()
    const buttons = dialog?.querySelectorAll('button') ?? []
    const buttonTexts = Array.from(buttons).map((b) => b.innerHTML)
    const hasLeftChevron = buttonTexts.some(
      (html) => html.includes('chevron-left') || html.toLowerCase().includes('chevronleft'),
    )
    expect(hasLeftChevron).toBe(false)
    wrapper.unmount()
  })

  it('right nav arrow absent when hasNext is false', async () => {
    const list = [makeTexture({ id: 'a' }), makeTexture({ id: 'b' })]
    useTextureDetail().open('b', list)
    await nextTick()

    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await nextTick()

    const dialog = queryDialog()
    const svg = dialog?.querySelectorAll('svg') ?? []
    const hasRightChevron = Array.from(svg).some((s) =>
      s.innerHTML.toLowerCase().includes('chevron-right'),
    )
    expect(hasRightChevron).toBe(false)
    wrapper.unmount()
  })

  it('ArrowLeft key navigates to previous texture', async () => {
    const list = [makeTexture({ id: 'a' }), makeTexture({ id: 'b' })]
    useTextureDetail().open('b', list)
    await nextTick()

    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await nextTick()

    expect(useTextureDetail().activeTexture.value?.id).toBe('a')
    wrapper.unmount()
    useTextureDetail().close()
  })

  it('ArrowRight key navigates to next texture', async () => {
    const list = [makeTexture({ id: 'a' }), makeTexture({ id: 'b' })]
    useTextureDetail().open('a', list)
    await nextTick()

    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()

    expect(useTextureDetail().activeTexture.value?.id).toBe('b')
    wrapper.unmount()
    useTextureDetail().close()
  })

  it('Escape key closes the modal', async () => {
    const tex = makeTexture()
    useTextureDetail().open(tex.id, [tex])
    await nextTick()

    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()

    expect(useTextureDetail().activeTexture.value).toBeNull()
    wrapper.unmount()
  })

  it('keydown when no activeTexture is a no-op', async () => {
    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()

    expect(useTextureDetail().activeTexture.value).toBeNull()
    wrapper.unmount()
  })

  it('click on overlay background closes modal', async () => {
    const tex = makeTexture()
    useTextureDetail().open(tex.id, [tex])
    await nextTick()

    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await nextTick()

    const overlay = document.body.querySelector('[role="dialog"]') as HTMLElement
    overlay?.click()
    await nextTick()

    expect(useTextureDetail().activeTexture.value).toBeNull()
    wrapper.unmount()
  })

  it('clicking X button closes modal', async () => {
    const tex = makeTexture()
    useTextureDetail().open(tex.id, [tex])
    await nextTick()

    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await flushPromises()

    const buttons = Array.from(document.body.querySelectorAll('button'))
    const xBtn = buttons.find(
      (b) => b.querySelector('svg') && !b.innerHTML.toLowerCase().includes('chevron'),
    )
    xBtn?.click()
    await nextTick()

    expect(useTextureDetail().activeTexture.value).toBeNull()
    wrapper.unmount()
  })

  it('clicking prev nav button navigates to previous texture', async () => {
    const list = [makeTexture({ id: 'a' }), makeTexture({ id: 'b' }), makeTexture({ id: 'c' })]
    useTextureDetail().open('b', list)
    await nextTick()

    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await flushPromises()

    const buttons = Array.from(document.body.querySelectorAll('button'))
    const prevBtn = buttons.find((b) => b.innerHTML.toLowerCase().includes('chevron-left'))
    prevBtn?.click()
    await nextTick()

    expect(useTextureDetail().activeTexture.value?.id).toBe('a')
    wrapper.unmount()
    useTextureDetail().close()
  })

  it('clicking next nav button navigates to next texture', async () => {
    const list = [makeTexture({ id: 'a' }), makeTexture({ id: 'b' }), makeTexture({ id: 'c' })]
    useTextureDetail().open('b', list)
    await nextTick()

    const wrapper = mount(TextureDetailModal, { attachTo: document.body })
    await flushPromises()

    const buttons = Array.from(document.body.querySelectorAll('button'))
    const nextBtn = buttons.find((b) => b.innerHTML.toLowerCase().includes('chevron-right'))
    nextBtn?.click()
    await nextTick()

    expect(useTextureDetail().activeTexture.value?.id).toBe('c')
    wrapper.unmount()
    useTextureDetail().close()
  })
})
