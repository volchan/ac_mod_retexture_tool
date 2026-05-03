import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { Texture } from '@/types/index'
import ExtractEnhanceConfig from './ExtractEnhanceConfig.vue'

const textures: Texture[] = [
  {
    id: 'a',
    name: 'body.dds',
    path: '/mods/car/car.kn5',
    source: 'kn5',
    kn5File: 'car.kn5',
    category: 'body',
    width: 1024,
    height: 1024,
    format: 'BC3',
    previewUrl: '',
    isDecoded: true,
  },
  {
    id: 'b',
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
  },
]

function defaultProps() {
  return {
    textures,
    scale: 4 as const,
    model: 'RealESRGAN_General_x4_v3' as const,
    selectedIds: new Set(textures.map((t) => t.id)),
  }
}

describe('ExtractEnhanceConfig', () => {
  it('renders scale buttons', () => {
    const wrapper = mount(ExtractEnhanceConfig, { props: defaultProps() })
    expect(wrapper.text()).toContain('2×')
    expect(wrapper.text()).toContain('4×')
  })

  it('renders model buttons', () => {
    const wrapper = mount(ExtractEnhanceConfig, { props: defaultProps() })
    expect(wrapper.text()).toContain('General')
    expect(wrapper.text()).toContain('Anime')
    expect(wrapper.text()).toContain('LSDIR Compact')
    expect(wrapper.text()).toContain('Nomos 8K')
    expect(wrapper.text()).toContain('NMKD Siax')
  })

  it('renders texture list with names and dimensions', () => {
    const wrapper = mount(ExtractEnhanceConfig, { props: defaultProps() })
    expect(wrapper.text()).toContain('body.dds')
    expect(wrapper.text()).toContain('1024×1024')
    expect(wrapper.text()).toContain('livery.dds')
    expect(wrapper.text()).toContain('512×512')
  })

  it('shows correct selected count', () => {
    const wrapper = mount(ExtractEnhanceConfig, { props: defaultProps() })
    expect(wrapper.text()).toContain('2/2')
  })

  it('emits update:scale when scale button clicked', async () => {
    const wrapper = mount(ExtractEnhanceConfig, { props: defaultProps() })
    const btn2x = wrapper.findAll('button').find((b) => b.text().trim() === '2×')
    expect(btn2x).toBeDefined()
    await btn2x!.trigger('click')
    expect(wrapper.emitted('update:scale')).toEqual([[2]])
  })

  it('emits update:model when Anime clicked', async () => {
    const wrapper = mount(ExtractEnhanceConfig, { props: defaultProps() })
    const animeBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Anime')
    expect(animeBtn).toBeDefined()
    await animeBtn!.trigger('click')
    expect(wrapper.emitted('update:model')).toEqual([['realesr-animevideov3-x4']])
  })

  it('shows photo description when photo model active', () => {
    const wrapper = mount(ExtractEnhanceConfig, { props: defaultProps() })
    expect(wrapper.text()).toContain('photorealistic')
  })

  it('shows anime description when anime model active', () => {
    const wrapper = mount(ExtractEnhanceConfig, {
      props: { ...defaultProps(), model: 'realesr-animevideov3-x4' as const },
    })
    expect(wrapper.text()).toContain('Illustrated')
  })

  it('toggleAll deselects all when all selected', async () => {
    const wrapper = mount(ExtractEnhanceConfig, { props: defaultProps() })
    await wrapper.vm.toggleAll()
    await nextTick()
    const emitted = wrapper.emitted('update:selectedIds')
    expect(emitted).toBeDefined()
    const lastEmit = emitted?.[emitted.length - 1][0] as Set<string>
    expect(lastEmit.size).toBe(0)
  })

  it('toggleAll selects all when none selected', async () => {
    const wrapper = mount(ExtractEnhanceConfig, {
      props: { ...defaultProps(), selectedIds: new Set<string>() },
    })
    await wrapper.vm.toggleAll()
    await nextTick()
    const emitted = wrapper.emitted('update:selectedIds')
    expect(emitted).toBeDefined()
    const lastEmit = emitted?.[emitted.length - 1][0] as Set<string>
    expect(lastEmit.size).toBe(2)
  })

  it('toggleTexture removes an id that is already selected', async () => {
    const wrapper = mount(ExtractEnhanceConfig, { props: defaultProps() })
    await wrapper.vm.toggleTexture('a')
    await nextTick()
    const emitted = wrapper.emitted('update:selectedIds')
    expect(emitted).toBeDefined()
    const last = emitted![emitted!.length - 1][0] as Set<string>
    expect(last.has('a')).toBe(false)
    expect(last.has('b')).toBe(true)
  })

  it('toggleTexture adds an id that is not selected', async () => {
    const wrapper = mount(ExtractEnhanceConfig, {
      props: { ...defaultProps(), selectedIds: new Set<string>() },
    })
    await wrapper.vm.toggleTexture('b')
    await nextTick()
    const emitted = wrapper.emitted('update:selectedIds')
    expect(emitted).toBeDefined()
    const last = emitted![emitted!.length - 1][0] as Set<string>
    expect(last.has('b')).toBe(true)
  })

  it('shows Deselect all when all selected', () => {
    const wrapper = mount(ExtractEnhanceConfig, { props: defaultProps() })
    expect(wrapper.text()).toContain('Deselect all')
  })

  it('shows Select all when none selected', () => {
    const wrapper = mount(ExtractEnhanceConfig, {
      props: { ...defaultProps(), selectedIds: new Set<string>() },
    })
    expect(wrapper.text()).toContain('Select all')
  })

  it('checkboxes reflect selectedIds', () => {
    const wrapper = mount(ExtractEnhanceConfig, {
      props: { ...defaultProps(), selectedIds: new Set(['a']) },
    })
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect((checkboxes[0].element as HTMLInputElement).checked).toBe(true)
    expect((checkboxes[1].element as HTMLInputElement).checked).toBe(false)
  })
})
