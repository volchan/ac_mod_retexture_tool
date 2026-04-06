import { clearInvokeHandlers, mockInvokeHandler } from '@tauri-apps/api'
import { open, save } from '@tauri-apps/plugin-dialog'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { Mod } from '@/types/index'
import TrackHeroImages from './TrackHeroImages.vue'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}))

const trackMod: Mod = {
  type: 'track',
  path: '/mods/monza',
  meta: { name: 'Monza', folderName: 'monza', author: '', version: '', description: '' },
  files: [],
  kn5Files: [],
  skinFolders: [],
}

beforeEach(() => {
  clearInvokeHandlers()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TrackHeroImages', () => {
  it('renders both hero image cards', async () => {
    mockInvokeHandler('get_track_hero_image', () => null)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await nextTick()

    expect(wrapper.text()).toContain('Loading screen')
    expect(wrapper.text()).toContain('Track outline')
  })

  it('shows placeholder icon when no image found', async () => {
    mockInvokeHandler('get_track_hero_image', () => null)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.findAll('img')).toHaveLength(0)
  })

  it('shows image when hero image is found', async () => {
    mockInvokeHandler('get_track_hero_image', () => 'data:image/png;base64,abc')

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.findAll('img')).toHaveLength(2)
  })

  it('shows Extract PNG buttons', async () => {
    mockInvokeHandler('get_track_hero_image', () => null)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await nextTick()

    const buttons = wrapper.findAll('button')
    const extractButtons = buttons.filter((b) => b.text().includes('Extract PNG'))
    expect(extractButtons).toHaveLength(2)
  })

  it('shows Replace buttons when no replacement', async () => {
    mockInvokeHandler('get_track_hero_image', () => null)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await nextTick()

    const buttons = wrapper.findAll('button')
    const replaceButtons = buttons.filter((b) => b.text().includes('Replace'))
    expect(replaceButtons).toHaveLength(2)
  })

  it('handleExtract calls save dialog and extracts image', async () => {
    mockInvokeHandler('get_track_hero_image', () => null)
    mockInvokeHandler('extract_track_hero_image', () => undefined)
    vi.mocked(save).mockResolvedValueOnce('/output/preview.png')

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await nextTick()

    const extractBtn = wrapper.findAll('button').find((b) => b.text().includes('Extract PNG'))
    await extractBtn?.trigger('click')
    await nextTick()

    expect(save).toHaveBeenCalled()
  })

  it('handleExtract does nothing when save dialog is cancelled', async () => {
    mockInvokeHandler('get_track_hero_image', () => null)
    vi.mocked(save).mockResolvedValueOnce(null)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await nextTick()

    const extractBtn = wrapper.findAll('button').find((b) => b.text().includes('Extract PNG'))
    await extractBtn?.trigger('click')
    await nextTick()

    expect(save).toHaveBeenCalled()
  })

  it('handleReplace shows replacement preview', async () => {
    mockInvokeHandler('get_track_hero_image', () => null)
    mockInvokeHandler('preview_replacement_image', () => 'data:image/png;base64,replaced')
    vi.mocked(open).mockResolvedValueOnce('/some/image.png')

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await nextTick()

    const replaceBtn = wrapper.findAll('button').find((b) => b.text().includes('Replace'))
    await replaceBtn?.trigger('click')
    await nextTick()
    await nextTick()

    expect(open).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Replaced')
  })

  it('handleReplace does nothing when open dialog is cancelled', async () => {
    mockInvokeHandler('get_track_hero_image', () => null)
    vi.mocked(open).mockResolvedValueOnce(null)

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await nextTick()

    const replaceBtn = wrapper.findAll('button').find((b) => b.text().includes('Replace'))
    await replaceBtn?.trigger('click')
    await nextTick()

    expect(wrapper.text()).not.toContain('Replaced')
  })

  it('handleRevert clears replacement', async () => {
    mockInvokeHandler('get_track_hero_image', () => null)
    mockInvokeHandler('preview_replacement_image', () => 'data:image/png;base64,replaced')
    vi.mocked(open).mockResolvedValueOnce('/some/image.png')

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
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
    mockInvokeHandler('get_track_hero_image', () => null)
    vi.mocked(open).mockResolvedValueOnce(['/some/image.png'])

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await nextTick()

    const replaceBtn = wrapper.findAll('button').find((b) => b.text().includes('Replace'))
    await replaceBtn?.trigger('click')
    await nextTick()

    expect(wrapper.text()).not.toContain('Replaced')
  })

  it('shows url when replacementUrl is null but url is set', async () => {
    mockInvokeHandler('get_track_hero_image', () => 'data:image/png;base64,original')

    const wrapper = mount(TrackHeroImages, { props: { mod: trackMod } })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    const imgs = wrapper.findAll('img')
    expect(imgs.length).toBeGreaterThan(0)
    expect(imgs[0].attributes('src')).toBe('data:image/png;base64,original')
  })
})
