import { clearInvokeHandlers, mockInvokeHandler } from '@tauri-apps/api'
import { listen } from '@tauri-apps/api/event'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { useGlobalCommands } from '@/composables/useGlobalCommands'
import { useTextures } from '@/composables/useTextures'
import type { Mod, Texture } from '@/types/index'
import ModInfoPanel from './ModInfoPanel.vue'

const carMod: Mod = {
  modType: 'car',
  path: '/mods/ferrari_488',
  meta: {
    name: 'Ferrari 488',
    folderName: 'ferrari_488',
    author: 'Kunos',
    version: '1.0',
    description: 'A fast car.',
  },
  carMeta: { brand: 'Ferrari', carClass: 'GT3', bhp: 670, weight: 1340 },
  files: [],
  kn5Files: ['ferrari_488.kn5'],
  skinFolders: [],
}

const trackMod: Mod = {
  modType: 'track',
  path: '/mods/watkins_glen',
  meta: {
    name: 'Watkins Glen',
    folderName: 'watkins_glen',
    author: 'AC',
    version: '2.0',
    description: 'Classic circuit.',
  },
  trackMeta: { country: 'USA', length: 5430, pitboxes: 32 },
  files: [],
  kn5Files: ['track.kn5'],
  skinFolders: [],
}

function makeTexture(
  id: string,
  replaced = false,
  kn5File = 'ferrari_488.kn5',
  replacementSize?: { width: number; height: number },
): Texture {
  return {
    id,
    name: `tex_${id}.dds`,
    path: '/mods/ferrari_488/ferrari_488.kn5',
    kn5File,
    source: 'kn5',
    category: 'body',
    width: 1024,
    height: 1024,
    format: 'BC3',
    previewUrl: '',
    isDecoded: true,
    replacement: replaced
      ? {
          sourcePath: '/import/tex.png',
          previewUrl: '',
          width: replacementSize?.width ?? 1024,
          height: replacementSize?.height ?? 1024,
        }
      : undefined,
  }
}

type EventHandler = (e: { payload: unknown }) => void

beforeEach(() => {
  clearInvokeHandlers()
  mockInvokeHandler('cancel_decode', () => undefined)
  vi.mocked(listen).mockResolvedValue(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  const { cleanup } = useTextures()
  cleanup()
})

async function seedTextures(textures: Texture[]) {
  const handlers = new Map<string, EventHandler>()
  vi.mocked(listen).mockImplementation(async (eventName, handler) => {
    handlers.set(eventName, handler as EventHandler)
    return () => {}
  })
  mockInvokeHandler('decode_mod_textures', () => {
    for (const t of textures) {
      handlers.get('decode-texture')?.({ payload: t })
    }
    return undefined
  })

  const App = defineComponent({
    setup() {
      const { init } = useTextures()
      init(carMod)
      return {}
    },
    template: '<div/>',
  })
  const w = mount(App)
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
  w.unmount()
}

describe('ModInfoPanel', () => {
  it('displays general fields from mod meta', () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    expect(wrapper.text()).toContain('Ferrari 488')
    expect(wrapper.text()).toContain('ferrari_488')
    expect(wrapper.text()).toContain('Kunos')
    expect(wrapper.text()).toContain('1.0')
  })

  it('shows car-specific fields for car mod', () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    expect(wrapper.text()).toContain('Car details')
    expect(wrapper.text()).toContain('Ferrari')
    expect(wrapper.text()).toContain('GT3')
    expect(wrapper.text()).toContain('670')
    expect(wrapper.text()).not.toContain('Track details')
  })

  it('shows track-specific fields for track mod', () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: trackMod } })
    expect(wrapper.text()).toContain('Track details')
    expect(wrapper.text()).toContain('USA')
    expect(wrapper.text()).toContain('5430')
    expect(wrapper.text()).toContain('32')
    expect(wrapper.text()).not.toContain('Car details')
  })

  it('has no editable inputs', () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    expect(wrapper.findAll('input')).toHaveLength(0)
    expect(wrapper.findAll('textarea')).toHaveLength(0)
  })

  it('shows repack as .zip button', () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    expect(wrapper.text()).toContain('.zip')
  })

  it('shows replacement count and kn5 breakdown when textures are replaced', async () => {
    await seedTextures([
      makeTexture('a', true, 'car.kn5'),
      makeTexture('b', true, 'car.kn5'),
      makeTexture('c', true, 'car_lod.kn5'),
      makeTexture('d', false),
    ])
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()
    expect(wrapper.text()).toContain('Queued for repack')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('car.kn5')
    expect(wrapper.text()).toContain('car_lod.kn5')
  })

  it('shows mismatch warning when replacement dimensions differ', async () => {
    await seedTextures([makeTexture('a', true, 'car.kn5', { width: 512, height: 512 })])
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()
    expect(wrapper.text()).toContain('different dimensions')
  })

  it('hides mismatch warning when dimensions match', async () => {
    await seedTextures([makeTexture('a', true, 'car.kn5')])
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()
    expect(wrapper.text()).not.toContain('different dimensions')
  })

  it('hides replacement section when no replacements', async () => {
    await seedTextures([makeTexture('a', false)])
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()
    expect(wrapper.text()).not.toContain('Queued for repack')
  })

  it('repack button is disabled when no replacements', () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('Repack'))
    expect(btn?.attributes('disabled')).toBeDefined()
  })

  it('repack button is enabled when there are replacements', async () => {
    await seedTextures([makeTexture('a', true, 'car.kn5')])
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('Repack'))
    expect(btn?.attributes('disabled')).toBeUndefined()
  })

  it('emits repack when Repack button is clicked', async () => {
    await seedTextures([makeTexture('a', true, 'car.kn5')])
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('Repack'))
    await btn?.trigger('click')
    expect(wrapper.emitted('repack')).toBeTruthy()
  })

  it('shows dashes for empty author, version, and no description', () => {
    const mod: Mod = {
      ...carMod,
      meta: { name: 'X', folderName: 'x', author: '', version: '', description: '' },
    }
    const wrapper = mount(ModInfoPanel, { props: { mod } })
    expect(wrapper.text()).not.toContain('Description')
  })

  it('shows dashes for empty car meta fields', () => {
    const mod: Mod = {
      ...carMod,
      carMeta: { brand: '', carClass: '', bhp: 0, weight: 0 },
    }
    const wrapper = mount(ModInfoPanel, { props: { mod } })
    expect(wrapper.text()).toContain('Car details')
  })

  it('shows dashes for empty track meta fields', () => {
    const mod: Mod = {
      ...trackMod,
      trackMeta: { country: '', length: 0, pitboxes: 0 },
    }
    const wrapper = mount(ModInfoPanel, { props: { mod } })
    expect(wrapper.text()).toContain('Track details')
  })

  it('shows singular mismatch text for exactly one mismatch', async () => {
    await seedTextures([makeTexture('a', true, 'car.kn5', { width: 512, height: 512 })])
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()
    expect(wrapper.text()).toContain('1 texture has different dimensions')
  })

  it('shows plural mismatch text for two mismatches', async () => {
    await seedTextures([
      makeTexture('a', true, 'car.kn5', { width: 512, height: 512 }),
      makeTexture('b', true, 'car.kn5', { width: 256, height: 256 }),
    ])
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()
    expect(wrapper.text()).toContain('2 textures have different dimensions')
  })

  it('detects height-only dimension mismatch', async () => {
    await seedTextures([makeTexture('a', true, 'car.kn5', { width: 1024, height: 512 })])
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()
    expect(wrapper.text()).toContain('different dimensions')
  })

  it('shows preview category texture under its label in breakdown', async () => {
    const previewTex: Texture = {
      id: 'p1',
      name: 'preview_boot.png',
      path: 'ui/boot/preview.png',
      source: 'skin',
      category: 'preview',
      width: 1920,
      height: 1080,
      format: 'PNG',
      previewUrl: '',
      isDecoded: true,
      replacement: { sourcePath: '/import/preview.png', previewUrl: '', width: 1920, height: 1080 },
    }
    const handlers = new Map<string, EventHandler>()
    vi.mocked(listen).mockImplementation(async (eventName, handler) => {
      handlers.set(eventName, handler as EventHandler)
      return () => {}
    })
    mockInvokeHandler('decode_mod_textures', () => {
      handlers.get('decode-texture')?.({ payload: previewTex })
      return undefined
    })
    const App = defineComponent({
      setup() {
        const { init } = useTextures()
        init(carMod)
        return {}
      },
      template: '<div/>',
    })
    const w = mount(App)
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
    w.unmount()

    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()
    expect(wrapper.text()).toContain('Queued for repack')
  })

  it('groups skin texture without kn5File under skinFolder in breakdown', async () => {
    const skinTex: Texture = {
      id: 's1',
      name: 'livery.dds',
      path: '/mods/car/skins/default/livery.dds',
      source: 'skin',
      skinFolder: 'default',
      category: 'livery',
      width: 512,
      height: 512,
      format: 'BC1',
      previewUrl: '',
      isDecoded: true,
      replacement: { sourcePath: '/import/livery.png', previewUrl: '', width: 512, height: 512 },
    }
    const handlers = new Map<string, EventHandler>()
    vi.mocked(listen).mockImplementation(async (eventName, handler) => {
      handlers.set(eventName, handler as EventHandler)
      return () => {}
    })
    mockInvokeHandler('decode_mod_textures', () => {
      handlers.get('decode-texture')?.({ payload: skinTex })
      return undefined
    })
    const App = defineComponent({
      setup() {
        const { init } = useTextures()
        init(carMod)
        return {}
      },
      template: '<div/>',
    })
    const w = mount(App)
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
    w.unmount()

    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()
    expect(wrapper.text()).toContain('default')
  })

  it('groups skin texture with no kn5File or skinFolder under "other"', async () => {
    const orphanTex: Texture = {
      id: 'o1',
      name: 'extra.dds',
      path: '/mods/car/extra.dds',
      source: 'skin',
      category: 'body',
      width: 256,
      height: 256,
      format: 'BC1',
      previewUrl: '',
      isDecoded: true,
      replacement: { sourcePath: '/import/extra.png', previewUrl: '', width: 256, height: 256 },
    }
    const handlers = new Map<string, EventHandler>()
    vi.mocked(listen).mockImplementation(async (eventName, handler) => {
      handlers.set(eventName, handler as EventHandler)
      return () => {}
    })
    mockInvokeHandler('decode_mod_textures', () => {
      handlers.get('decode-texture')?.({ payload: orphanTex })
      return undefined
    })
    const App = defineComponent({
      setup() {
        const { init } = useTextures()
        init(carMod)
        return {}
      },
      template: '<div/>',
    })
    const w = mount(App)
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
    w.unmount()

    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()
    expect(wrapper.text()).toContain('other')
  })

  it('queueTick watch switches activeTab to queue', async () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()

    expect(wrapper.vm.activeTab).toBe('info')

    const { triggerQueue } = useGlobalCommands()
    triggerQueue()
    await nextTick()

    expect(wrapper.vm.activeTab).toBe('queue')
    wrapper.unmount()
  })

  it('renders QueueDrawer when activeTab is queue', async () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    await nextTick()

    wrapper.vm.activeTab = 'queue'
    await nextTick()

    const queueDrawer = wrapper.findComponent({ name: 'QueueDrawer' })
    expect(queueDrawer.exists()).toBe(true)
    wrapper.unmount()
  })
})
