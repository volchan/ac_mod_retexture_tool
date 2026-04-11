import { clearInvokeHandlers, mockInvokeHandler } from '@tauri-apps/api'
import { listen } from '@tauri-apps/api/event'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
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
  // Reset shared texture state
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
  it('pre-fills general fields from mod meta', () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    const vm = wrapper.vm as InstanceType<typeof ModInfoPanel>
    expect(vm.name).toBe('Ferrari 488')
    expect(vm.author).toBe('Kunos')
    expect(vm.version).toBe('1.0')
  })

  it('shows car-specific fields for car mod', () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    expect(wrapper.text()).toContain('Car details')
    expect(wrapper.text()).toContain('Brand')
    expect(wrapper.text()).toContain('BHP')
    expect(wrapper.text()).not.toContain('Track details')
  })

  it('shows track-specific fields for track mod', () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: trackMod } })
    expect(wrapper.text()).toContain('Track details')
    expect(wrapper.text()).toContain('Country')
    expect(wrapper.text()).not.toContain('Car details')
  })

  it('pre-fills car-specific fields', () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    const vm = wrapper.vm as InstanceType<typeof ModInfoPanel>
    expect(vm.brand).toBe('Ferrari')
    expect(vm.carClass).toBe('GT3')
    expect(vm.bhp).toBe(670)
    expect(vm.weight).toBe(1340)
  })

  it('pre-fills track-specific fields', () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: trackMod } })
    const vm = wrapper.vm as InstanceType<typeof ModInfoPanel>
    expect(vm.country).toBe('USA')
  })

  it('does not show length or pitboxes fields', () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: trackMod } })
    expect(wrapper.text()).not.toContain('Pit boxes')
    expect(wrapper.text()).not.toContain('Length')
  })

  it('reset restores original values', async () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    const vm = wrapper.vm as InstanceType<typeof ModInfoPanel>
    vm.name = 'Modified Name'
    vm.author = 'Someone'
    await nextTick()
    vm.reset()
    await nextTick()
    expect(vm.name).toBe('Ferrari 488')
    expect(vm.author).toBe('Kunos')
  })

  it('shows folder name warning when folder name is changed', async () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    const vm = wrapper.vm as InstanceType<typeof ModInfoPanel>
    expect(wrapper.text()).not.toContain('Renaming')
    vm.folderName = 'ferrari_488_gt3'
    await nextTick()
    expect(wrapper.text()).toContain('Renaming')
  })

  it('does not show folder warning when unchanged', () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    expect(wrapper.text()).not.toContain('Renaming')
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

  it('emits repack when Repack button is clicked', async () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('Repack'))
    await btn?.trigger('click')
    expect(wrapper.emitted('repack')).toBeTruthy()
  })

  it('Reset button resets fields without emitting repack', async () => {
    const wrapper = mount(ModInfoPanel, { props: { mod: carMod } })
    const vm = wrapper.vm as InstanceType<typeof ModInfoPanel>
    vm.name = 'Changed'
    const btn = wrapper.findAll('button').find((b) => b.text().includes('Reset'))
    await btn?.trigger('click')
    expect(vm.name).toBe('Ferrari 488')
    expect(wrapper.emitted('repack')).toBeFalsy()
  })
})
