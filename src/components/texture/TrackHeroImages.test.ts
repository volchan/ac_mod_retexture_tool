import { clearInvokeHandlers, mockInvokeHandler } from '@tauri-apps/api'
import { open, save } from '@tauri-apps/plugin-dialog'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { Mod, TrackLayoutHero } from '@/types/index'
import TrackHeroImages from './TrackHeroImages.vue'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}))

const trackMod: Mod = {
  modType: 'track',
  path: '/mods/monza',
  meta: { name: 'Monza', folderName: 'monza', author: '', version: '', description: '' },
  files: [],
  kn5Files: [],
  skinFolders: [],
}

const singleHero: TrackLayoutHero[] = [
  { label: 'Loading screen', filename: 'preview.png', url: null },
]

const multiHero: TrackLayoutHero[] = [
  { label: 'Loading screen (boot)', filename: 'ui/boot/preview.png', url: null },
  { label: 'Loading screen (short)', filename: 'ui/short/preview.png', url: null },
]

beforeEach(() => {
  clearInvokeHandlers()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TrackHeroImages', () => {
  it('renders Loading screen card for single-layout track', async () => {
    mockInvokeHandler('list_track_hero_images', () => singleHero)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.text()).toContain('Loading screen')
  })

  it('renders a card per layout for multi-layout track', async () => {
    mockInvokeHandler('list_track_hero_images', () => multiHero)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.text()).toContain('Loading screen (boot)')
    expect(wrapper.text()).toContain('Loading screen (short)')
  })

  it('shows placeholder icon when no image found', async () => {
    mockInvokeHandler('list_track_hero_images', () => singleHero)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.findAll('img')).toHaveLength(0)
  })

  it('shows image when hero image url is set', async () => {
    const withImage: TrackLayoutHero[] = [
      { label: 'Loading screen', filename: 'preview.png', url: 'data:image/png;base64,abc' },
    ]
    mockInvokeHandler('list_track_hero_images', () => withImage)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.findAll('img')).toHaveLength(1)
  })

  it('shows Extract PNG buttons', async () => {
    mockInvokeHandler('list_track_hero_images', () => singleHero)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    const buttons = wrapper.findAll('button')
    const extractButtons = buttons.filter((b) => b.text().includes('Extract PNG'))
    expect(extractButtons).toHaveLength(1)
  })

  it('shows Replace buttons when no replacement', async () => {
    mockInvokeHandler('list_track_hero_images', () => singleHero)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    const buttons = wrapper.findAll('button')
    const replaceButtons = buttons.filter((b) => b.text().includes('Replace'))
    expect(replaceButtons).toHaveLength(1)
  })

  it('shows two Extract PNG buttons for multi-layout track', async () => {
    mockInvokeHandler('list_track_hero_images', () => multiHero)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    const buttons = wrapper.findAll('button')
    const extractButtons = buttons.filter((b) => b.text().includes('Extract PNG'))
    expect(extractButtons).toHaveLength(2)
  })

  it('handleExtract calls save dialog and extracts image', async () => {
    mockInvokeHandler('list_track_hero_images', () => singleHero)
    mockInvokeHandler('extract_track_hero_image', () => undefined)
    vi.mocked(save).mockResolvedValueOnce('/output/preview.png')

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    const extractBtn = wrapper.findAll('button').find((b) => b.text().includes('Extract PNG'))
    await extractBtn?.trigger('click')
    await nextTick()

    expect(save).toHaveBeenCalled()
  })

  it('handleExtract does nothing when save dialog is cancelled', async () => {
    mockInvokeHandler('list_track_hero_images', () => singleHero)
    vi.mocked(save).mockResolvedValueOnce(null)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    const extractBtn = wrapper.findAll('button').find((b) => b.text().includes('Extract PNG'))
    await extractBtn?.trigger('click')
    await nextTick()

    expect(save).toHaveBeenCalled()
  })

  it('handleReplace shows replacement preview', async () => {
    mockInvokeHandler('list_track_hero_images', () => singleHero)
    mockInvokeHandler('preview_replacement_image', () => 'data:image/png;base64,replaced')
    vi.mocked(open).mockResolvedValueOnce('/some/image.png')

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    const replaceBtn = wrapper.findAll('button').find((b) => b.text().includes('Replace'))
    await replaceBtn?.trigger('click')
    await nextTick()
    await nextTick()

    expect(open).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Replaced')
  })

  it('handleReplace does nothing when open dialog is cancelled', async () => {
    mockInvokeHandler('list_track_hero_images', () => singleHero)
    vi.mocked(open).mockResolvedValueOnce(null)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    const replaceBtn = wrapper.findAll('button').find((b) => b.text().includes('Replace'))
    await replaceBtn?.trigger('click')
    await nextTick()

    expect(wrapper.text()).not.toContain('Replaced')
  })

  it('handleRevert clears replacement', async () => {
    mockInvokeHandler('list_track_hero_images', () => singleHero)
    mockInvokeHandler('preview_replacement_image', () => 'data:image/png;base64,replaced')
    vi.mocked(open).mockResolvedValueOnce('/some/image.png')

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    const replaceBtn = wrapper.findAll('button').find((b) => b.text().includes('Replace'))
    await replaceBtn?.trigger('click')
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('Replaced')

    const revertBtn = wrapper.findAll('button').find((b) => b.text().includes('Revert'))
    await revertBtn?.trigger('click')
    await nextTick()

    expect(wrapper.text()).not.toContain('Replaced')
    expect(wrapper.text()).toContain('Replace')
  })

  it('handleReplace does nothing when open returns array', async () => {
    mockInvokeHandler('list_track_hero_images', () => singleHero)
    vi.mocked(open).mockResolvedValueOnce(['/some/image.png'])

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    const replaceBtn = wrapper.findAll('button').find((b) => b.text().includes('Replace'))
    await replaceBtn?.trigger('click')
    await nextTick()

    expect(wrapper.text()).not.toContain('Replaced')
  })

  it('shows image src from url when set', async () => {
    const withImage: TrackLayoutHero[] = [
      { label: 'Loading screen', filename: 'preview.png', url: 'data:image/png;base64,original' },
    ]
    mockInvokeHandler('list_track_hero_images', () => withImage)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    const imgs = wrapper.findAll('img')
    expect(imgs.length).toBeGreaterThan(0)
    expect(imgs[0].attributes('src')).toBe('data:image/png;base64,original')
  })
})
