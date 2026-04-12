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
    expect(wrapper.find('.bg-blue-500.rounded-full').exists()).toBe(true)
  })

  it('does not show checkmark when not selected', () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: false },
    })
    expect(wrapper.find('.bg-blue-500.rounded-full').exists()).toBe(false)
  })

  it('shows amber Replaced badge when texture has replacement', () => {
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
    expect(wrapper.find('.bg-amber-500').exists()).toBe(true)
  })

  it('does not show amber badge when no replacement', () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: false },
    })
    expect(wrapper.find('.bg-amber-500').exists()).toBe(false)
  })

  it('emits toggle-select when clicked', async () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: false },
    })
    await wrapper.trigger('click')
    expect(wrapper.emitted('toggle-select')).toHaveLength(1)
  })

  it('applies ring-2 ring-blue-500 class when selected', () => {
    const wrapper = mount(TextureCard, {
      props: { texture: makeTexture(), isSelected: true },
    })
    expect(wrapper.classes()).toContain('ring-2')
    expect(wrapper.classes()).toContain('ring-blue-500')
  })

  it('applies amber ring class when replaced', () => {
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
    expect(wrapper.classes()).toContain('ring-amber-500')
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

  // preview category (Content Manager preview.png thumbnails)
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

  it('preview card uses aspect-square image area', () => {
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
    expect(wrapper.find('.aspect-square').exists()).toBe(true)
    expect(wrapper.find('.aspect-video').exists()).toBe(false)
  })
})
