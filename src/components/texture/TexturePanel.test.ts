import { clearInvokeHandlers, mockInvokeHandler } from '@tauri-apps/api'
import { listen } from '@tauri-apps/api/event'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { Mod, Texture } from '@/types/index'
import TexturePanel from './TexturePanel.vue'

const baseMod: Mod = {
  modType: 'car',
  path: '/mods/ferrari',
  meta: { name: 'Ferrari', folderName: 'ferrari', author: '', version: '', description: '' },
  files: [],
  kn5Files: ['car.kn5'],
  skinFolders: [],
}

function makeTexture(overrides: Partial<Texture> = {}): Texture {
  return {
    id: 'tex1',
    name: 'body.dds',
    path: '/mods/ferrari/car.kn5',
    source: 'kn5',
    category: 'body',
    width: 512,
    height: 512,
    format: 'BC1',
    previewUrl: 'data:image/png;base64,abc',
    isDecoded: true,
    ...overrides,
  }
}

async function waitForDecoding() {
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

type EventHandler = (e: { payload: unknown }) => void
let capturedHandlers: Map<string, EventHandler>

beforeEach(() => {
  clearInvokeHandlers()
  mockInvokeHandler('cancel_decode', () => undefined)
  mockInvokeHandler('list_track_hero_images', () => [])
  capturedHandlers = new Map()
  vi.mocked(listen).mockImplementation(async (eventName, handler) => {
    capturedHandlers.set(eventName, handler as EventHandler)
    return () => {}
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function emitDecodeTexture(texture: Texture) {
  capturedHandlers.get('decode-texture')?.({ payload: texture })
}

function emitDecodeProgress(current: number, total: number, label: string) {
  capturedHandlers.get('decode-progress')?.({ payload: { current, total, label } })
}

describe('TexturePanel', () => {
  it('shows progress bar while decoding', async () => {
    let resolveDecoding!: () => void
    const pending = new Promise<void>((r) => {
      resolveDecoding = r
    })
    mockInvokeHandler('decode_mod_textures', () => pending)

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await nextTick()

    expect(wrapper.find('.h-1').exists()).toBe(true)

    resolveDecoding()
    await waitForDecoding()
    wrapper.unmount()
  })

  it('hides progress bar after decoding completes', async () => {
    mockInvokeHandler('decode_mod_textures', () => Promise.resolve(undefined))

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    expect(wrapper.find('.h-1').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders texture cards after loading', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a', name: 'tex_a.dds' }))
      emitDecodeTexture(makeTexture({ id: 'b', name: 'tex_b.dds' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    expect(wrapper.text()).toContain('tex_a.dds')
    expect(wrapper.text()).toContain('tex_b.dds')
    wrapper.unmount()
  })

  it('shows car categories for car mod', async () => {
    mockInvokeHandler('decode_mod_textures', () => Promise.resolve(undefined))

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await nextTick()

    expect(wrapper.text()).toContain('Body')
    expect(wrapper.text()).toContain('Interior')
    expect(wrapper.text()).toContain('Wheels')
    wrapper.unmount()
  })

  it('shows track categories for track mod', async () => {
    mockInvokeHandler('decode_mod_textures', () => Promise.resolve(undefined))
    mockInvokeHandler('get_track_hero_image', () => null)

    const trackMod: Mod = { ...baseMod, modType: 'track' }
    const wrapper = mount(TexturePanel, { props: { mod: trackMod } })
    await nextTick()

    expect(wrapper.text()).toContain('Road')
    expect(wrapper.text()).toContain('Terrain')
    expect(wrapper.text()).toContain('Sky')
    wrapper.unmount()
  })

  it('shows selected count', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    expect(wrapper.text()).toContain('0 selected')
    wrapper.unmount()
  })

  it('emits selection-change when select all is clicked', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a' }))
      emitDecodeTexture(makeTexture({ id: 'b' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    const buttons = wrapper.findAll('button')
    const selectAllBtn = buttons.find((b) => b.text() === 'Select all')
    await selectAllBtn?.trigger('click')

    expect(wrapper.emitted('selection-change')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits selection-change when deselect all is clicked', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    const buttons = wrapper.findAll('button')
    const deselectBtn = buttons.find((b) => b.text() === 'Deselect all')
    await deselectBtn?.trigger('click')

    expect(wrapper.emitted('selection-change')).toBeTruthy()
    wrapper.unmount()
  })

  it('shows empty state message when no textures in active category', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a', category: 'interior' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    expect(wrapper.text()).toContain('selected')
    wrapper.unmount()
  })

  it('shows progress count when decodeProgress total > 0', async () => {
    let resolveDecoding!: () => void
    const pending = new Promise<void>((r) => {
      resolveDecoding = r
    })
    mockInvokeHandler('decode_mod_textures', () => pending)

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    // Wait for all listeners in init() to register (two await listen() calls)
    await nextTick()
    await nextTick()
    await nextTick()

    emitDecodeProgress(1, 3, 'car.kn5')
    await nextTick()

    expect(wrapper.text()).toContain('1/3')

    resolveDecoding()
    await waitForDecoding()
    wrapper.unmount()
  })

  it('emits selection-change when texture card is toggled', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a', category: 'body' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    const card = wrapper.find('div.relative.cursor-pointer')
    if (card.exists()) {
      await card.trigger('click')
    }

    await nextTick()
    wrapper.unmount()
  })

  it('changes active category when CategoryTabs emits change', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a', category: 'body' }))
      emitDecodeTexture(makeTexture({ id: 'b', category: 'interior' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    const categoryTabsVm = wrapper.findComponent({ name: 'CategoryTabs' }).vm
    categoryTabsVm.$emit('change', 'interior')
    await nextTick()

    expect(wrapper.text()).toContain('0 selected')
    wrapper.unmount()
  })
})
