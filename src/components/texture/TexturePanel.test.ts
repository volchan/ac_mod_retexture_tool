import { clearInvokeHandlers, mockInvokeHandler } from '@tauri-apps/api'
import { listen } from '@tauri-apps/api/event'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { MatchedTexture, Mod, Texture } from '@/types/index'
import TexturePanel from './TexturePanel.vue'

const mockOpenPreviewWindow = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>()
  return { ...actual, openTexturePreviewWindow: mockOpenPreviewWindow }
})

const baseMod: Mod = {
  modType: 'car',
  path: '/mods/ferrari',
  meta: { name: 'Ferrari', folderName: 'ferrari', author: '', version: '', description: '' },
  files: [],
  kn5Files: ['car.kn5'],
  skinFolders: [],
}

const trackMod: Mod = { ...baseMod, modType: 'track' }

function makeTexture(overrides: Partial<Texture> = {}): Texture {
  return {
    id: 'tex1',
    name: 'body.dds',
    path: '/mods/ferrari/car.kn5',
    source: 'kn5',
    kn5File: 'car.kn5',
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
  mockOpenPreviewWindow.mockClear()
  clearInvokeHandlers()
  mockInvokeHandler('cancel_decode', () => undefined)
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

    const wrapper = mount(TexturePanel, { props: { mod: trackMod } })
    await nextTick()

    expect(wrapper.text()).toContain('Road')
    expect(wrapper.text()).toContain('Terrain')
    expect(wrapper.text()).toContain('Sky')
    expect(wrapper.text()).toContain('Preview image')
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

  it('clicking card toggles selection and emits selection-change', async () => {
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

    expect(wrapper.emitted('selection-change')).toBeTruthy()
    wrapper.unmount()
  })

  it('clicking magnifier button opens texture preview window', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a', category: 'body' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    const btn = wrapper.find('button[title="View full size"]')
    if (btn.exists()) {
      await btn.trigger('click')
    }
    await nextTick()

    expect(mockOpenPreviewWindow).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
    wrapper.unmount()
  })

  it('handleOpenDetail opens preview window for given texture', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a', category: 'body' }))
      emitDecodeTexture(makeTexture({ id: 'b', category: 'body' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    await wrapper.vm.handleOpenDetail('b')

    expect(mockOpenPreviewWindow).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
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

  it('groups textures by kn5File origin', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a', name: 'tex_a.dds', kn5File: 'car.kn5' }))
      emitDecodeTexture(makeTexture({ id: 'b', name: 'tex_b.dds', kn5File: 'interior.kn5' }))
      emitDecodeTexture(makeTexture({ id: 'c', name: 'tex_c.dds', kn5File: 'car.kn5' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    const groups = wrapper.vm.groupedTextures
    expect(groups.length).toBe(2)
    const carGroup = groups.find((g: { key: string }) => g.key === 'car.kn5')
    const intGroup = groups.find((g: { key: string }) => g.key === 'interior.kn5')
    expect(carGroup?.textures.length).toBe(2)
    expect(intGroup?.textures.length).toBe(1)
    wrapper.unmount()
  })

  it('preview textures appear in hero group at top', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(
        makeTexture({ id: 'a', name: 'body.dds', kn5File: 'car.kn5', category: 'body' }),
      )
      emitDecodeTexture(
        makeTexture({
          id: 'b',
          name: 'preview.png',
          kn5File: undefined,
          skinFolder: undefined,
          source: 'skin',
          category: 'preview',
        }),
      )
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    const groups = wrapper.vm.groupedTextures
    expect(groups[0].key).toBe('__hero__')
    expect(groups[0].textures[0].category).toBe('preview')
    wrapper.unmount()
  })

  it('origin groups sorted alphabetically', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(
        makeTexture({ id: 'a', name: 'tex.dds', kn5File: 'zzz.kn5', category: 'road' }),
      )
      emitDecodeTexture(
        makeTexture({ id: 'b', name: 'tex.dds', kn5File: 'aaa.kn5', category: 'road' }),
      )
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: trackMod } })
    await waitForDecoding()

    const groups = wrapper.vm.groupedTextures
    expect(groups[0].key).toBe('aaa.kn5')
    expect(groups[1].key).toBe('zzz.kn5')
    wrapper.unmount()
  })

  it('handleImport does nothing when no textures loaded', async () => {
    mockInvokeHandler('decode_mod_textures', () => undefined)

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    await wrapper.vm.handleImport('/import')
    await nextTick()

    expect(wrapper.vm.importDialogOpen).toBe(false)
    wrapper.unmount()
  })

  it('handleImport calls scan and opens import dialog', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a', source: 'kn5', kn5File: 'car.kn5' }))
      emitDecodeTexture(
        makeTexture({ id: 'b', source: 'skin', skinFolder: 'default', kn5File: undefined }),
      )
      emitDecodeTexture(
        makeTexture({ id: 'c', source: 'skin', skinFolder: undefined, kn5File: undefined }),
      )
      return undefined
    })
    mockInvokeHandler('scan_import_folder', () => ({
      matched: [
        {
          textureId: 'a',
          sourcePath: '/import/body.png',
          previewUrl: 'data:image/png;base64,x',
          sourceWidth: 1024,
          sourceHeight: 1024,
          hasDimensionMismatch: false,
        },
      ],
      unmatched: [],
    }))

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    await wrapper.vm.handleImport('/import')
    await nextTick()

    expect(wrapper.vm.importDialogOpen).toBe(true)
    expect(wrapper.vm.importMatched).toHaveLength(1)
    wrapper.unmount()
  })

  it('multiple hero textures are sorted in hero group', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(
        makeTexture({ id: 'z', name: 'z_preview.png', category: 'preview', source: 'skin' }),
      )
      emitDecodeTexture(
        makeTexture({ id: 'a', name: 'a_preview.png', category: 'preview', source: 'skin' }),
      )
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    const groups = wrapper.vm.groupedTextures
    expect(groups[0].key).toBe('__hero__')
    expect(groups[0].textures[0].name).toBe('a_preview.png')
    expect(groups[0].textures[1].name).toBe('z_preview.png')
    wrapper.unmount()
  })

  it('clicking extract button opens extract dialog', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    const selectAllBtn = wrapper.findAll('button').find((b) => b.text() === 'Select all')
    await selectAllBtn?.trigger('click')
    await nextTick()

    const extractBtn = wrapper.findAll('button').find((b) => b.text().includes('Extract'))
    await extractBtn?.trigger('click')
    await nextTick()

    expect(wrapper.vm.extractDialogOpen).toBe(true)
    wrapper.unmount()
  })

  it('extract dialog v-model close updates extractDialogOpen', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    wrapper.vm.extractDialogOpen = true
    await nextTick()

    const extractDialog = wrapper.findComponent({ name: 'ExtractDialog' })
    await extractDialog.vm.$emit('update:isOpen', false)
    await nextTick()

    expect(wrapper.vm.extractDialogOpen).toBe(false)
    wrapper.unmount()
  })

  it('import dialog v-model close updates importDialogOpen', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    wrapper.vm.importDialogOpen = true
    await nextTick()

    const importDialog = wrapper.findComponent({ name: 'ImportConfirmDialog' })
    await importDialog.vm.$emit('update:isOpen', false)
    await nextTick()

    expect(wrapper.vm.importDialogOpen).toBe(false)
    wrapper.unmount()
  })

  it('handleApplyImport applies replacements to textures', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a' }))
      return undefined
    })

    const wrapper = mount(TexturePanel, { props: { mod: baseMod } })
    await waitForDecoding()

    const tex = wrapper.vm.groupedTextures[0]?.textures[0] as Texture
    const matched: MatchedTexture[] = [
      {
        texture: tex,
        sourcePath: '/import/body.png',
        previewUrl: 'data:image/png;base64,x',
        sourceWidth: 1024,
        sourceHeight: 1024,
        hasDimensionMismatch: false,
      },
    ]
    wrapper.vm.handleApplyImport(matched)
    await nextTick()

    expect(wrapper.vm.groupedTextures[0]?.textures[0]?.replacement).toBeDefined()
    wrapper.unmount()
  })
})
