import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Texture } from '@/types/index'
import TextureCard from './TextureCard.vue'

function makeTexture(overrides: Partial<Texture> = {}): Texture {
  return {
    id: 'tex1',
    name: 'body_paint.dds',
    path: '/mods/car.kn5',
    source: 'kn5',
    category: 'body',
    width: 1024,
    height: 1024,
    format: 'BC3',
    previewUrl: 'data:image/png;base64,abc',
    isDecoded: true,
    ...overrides,
  }
}

describe('TextureCard', () => {
  it('renders texture name, dimensions and format', () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: false },
    })
    expect(wrapper.text()).toContain('body_paint.dds')
    expect(wrapper.text()).toContain('1024×1024')
    expect(wrapper.text()).toContain('BC3')
  })

  it('shows spinner when texture is not decoded', () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture({ isDecoded: false }), isSelected: false },
    })
    expect(wrapper.find('.animate-spin').exists()).toBe(true)
  })

  it('does not show spinner when texture is decoded', () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture({ isDecoded: true }), isSelected: false },
    })
    expect(wrapper.find('.animate-spin').exists()).toBe(false)
  })

  it('shows checkmark badge when selected', () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: true },
    })
    expect(wrapper.find('.bg-primary.rounded-\\[4px\\]').exists()).toBe(true)
  })

  it('does not show checkmark badge when not selected', () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: false },
    })
    expect(wrapper.find('.bg-primary.rounded-\\[4px\\]').exists()).toBe(false)
  })

  it('shows Replaced badge when texture has same-size replacement', () => {
    const texture = makeTexture({
      replacement: {
        sourcePath: '/new/tex.png',
        previewUrl: 'data:image/png;base64,xyz',
        width: 1024,
        height: 1024,
      },
    })
    const wrapper = mount(TextureCard, {
      props: { texture, isSelected: false },
    })
    expect(wrapper.text()).toContain('Replaced')
  })

  it('shows Size↕ badge when replacement has different dimensions', () => {
    const texture = makeTexture({
      replacement: {
        sourcePath: '/new/tex.png',
        previewUrl: 'data:image/png;base64,xyz',
        width: 512,
        height: 512,
      },
    })
    const wrapper = mount(TextureCard, {
      props: { texture, isSelected: false },
    })
    expect(wrapper.text()).toContain('Size↕')
  })

  it('does not show badge when no replacement', () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: false },
    })
    expect(wrapper.text()).not.toContain('Replaced')
    expect(wrapper.text()).not.toContain('Size↕')
  })

  it('emits toggle-select when card is clicked', async () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: false },
    })
    await wrapper.trigger('click')
    expect(wrapper.emitted('toggle-select')).toHaveLength(1)
    expect(wrapper.emitted('open-detail')).toBeFalsy()
  })

  it('emits open-detail when magnifier button is clicked', async () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: false },
    })
    const btn = wrapper.find('button[title="View full size"]')
    await btn.trigger('click')
    expect(wrapper.emitted('open-detail')).toHaveLength(1)
  })

  it('magnifier click does not emit toggle-select', async () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: false },
    })
    const btn = wrapper.find('button[title="View full size"]')
    await btn.trigger('click')
    expect(wrapper.emitted('toggle-select')).toBeFalsy()
  })

  it('applies border-primary class when selected', () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: true },
    })
    expect(wrapper.classes()).toContain('border-primary')
  })

  it('applies border-amber-400 when replacement has dimension mismatch', () => {
    const texture = makeTexture({
      replacement: {
        sourcePath: '/new/tex.png',
        previewUrl: 'data:image/png;base64,xyz',
        width: 512,
        height: 512,
      },
    })
    const wrapper = mount(TextureCard, {
      props: { texture, isSelected: false },
    })
    expect(wrapper.classes()).toContain('border-amber-400')
  })

  it('renders preview image when isDecoded and previewUrl is set', () => {
    const wrapper = mount(TextureCard, {
      props: {
        texture: makeTexture({ previewUrl: 'data:image/png;base64,test' }),
        isSelected: false,
      },
    })
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('data:image/png;base64,test')
  })

  it('preview card does not span 2 columns', () => {
    const wrapper = mount(TextureCard, {
      props: {
        texture: makeTexture({
          category: 'preview',
          name: 'preview.png',
          source: 'skin',
          path: 'ui/preview.png',
        }),
        isSelected: false,
      },
    })
    expect(wrapper.classes()).not.toContain('col-span-2')
  })

  it('preview card shows "Preview image" label in name row', () => {
    const wrapper = mount(TextureCard, {
      props: {
        texture: makeTexture({
          category: 'preview',
          name: 'preview.png',
          source: 'skin',
          path: 'ui/preview.png',
        }),
        isSelected: false,
      },
    })
    expect(wrapper.text()).toContain('Preview image')
  })

  it('preview card with layout shows layout in name row', () => {
    const wrapper = mount(TextureCard, {
      props: {
        texture: makeTexture({
          category: 'preview',
          name: 'preview_boot.png',
          source: 'skin',
          path: 'ui/boot/preview.png',
        }),
        isSelected: false,
      },
    })
    expect(wrapper.text()).toContain('Preview image (boot)')
  })

  it('sm density applies smaller thumbnail height', () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: false, density: 'sm' },
    })
    expect(wrapper.find('.h-\\[76px\\]').exists()).toBe(true)
  })

  it('lg density applies larger thumbnail height', () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: false, density: 'lg' },
    })
    expect(wrapper.find('.h-\\[152px\\]').exists()).toBe(true)
  })
})
