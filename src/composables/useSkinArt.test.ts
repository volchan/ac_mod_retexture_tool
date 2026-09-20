import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { FALLBACK_COLOURS } from '@/lib/liveryBadge'
import { STUBBED_DATA_URL, stubCanvas } from '@/test-fixtures/canvas'
import type { Texture } from '@/types/index'
import { liveryTexture, useSkinArt } from './useSkinArt'
import { useTextures } from './useTextures'

const { writeSkinArt } = vi.hoisted(() => ({ writeSkinArt: vi.fn(async () => '/written/path') }))

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>()
  return { ...actual, writeSkinArt }
})

async function withSetup<T>(composable: () => T): Promise<{ result: T; unmount: () => void }> {
  let result!: T
  const App = defineComponent({
    setup() {
      result = composable()
      return {}
    },
    template: '<div/>',
  })
  const wrapper = mount(App)
  await nextTick()
  return { result, unmount: () => wrapper.unmount() }
}

function texture(overrides: Partial<Texture> = {}): Texture {
  return {
    id: 'body',
    name: 'body.dds',
    path: '/cars/gtm/body.dds',
    source: 'skin',
    category: 'livery',
    width: 1024,
    height: 1024,
    format: 'DXT5',
    previewUrl: '',
    isDecoded: true,
    ...overrides,
  }
}

/// Which texture the badge would speak for, by id.
function pickedId() {
  return liveryTexture(useTextures().textures.value)?.id
}

describe('useSkinArt', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    writeSkinArt.mockClear()
    stubCanvas()
    useTextures().textures.value = []
  })

  /// Sampling needs a decoded image, which jsdom never produces, so what is
  /// covered here is which texture is reached for — the sampling itself is
  /// tested where it lives.
  it('falls back while no livery texture has been decoded', async () => {
    const { result, unmount } = await withSetup(() => useSkinArt())

    expect(result.badgeColours.value).toEqual(FALLBACK_COLOURS)
    unmount()
  })

  it('leaves a livery the categoriser could not place without a colour', async () => {
    useTextures().textures.value = [texture({ category: 'other', previewUrl: '' })]
    const { result, unmount } = await withSetup(() => useSkinArt())
    await nextTick()

    expect(result.badgeColours.value).toEqual(FALLBACK_COLOURS)
    unmount()
  })

  it('writes the badge under the skin it is given', async () => {
    const { result, unmount } = await withSetup(() => useSkinArt())

    const written = await result.saveBadge('/cars/gtm', 'racing_blue', '24')

    expect(written).toBe('/written/path')
    expect(writeSkinArt).toHaveBeenCalledWith(
      '/cars/gtm',
      'racing_blue',
      'livery',
      STUBBED_DATA_URL.split(',')[1],
    )
    unmount()
  })

  it('sends the preview capture on as it is handed over', async () => {
    const { result, unmount } = await withSetup(() => useSkinArt())

    await result.savePreview('/cars/gtm', 'racing_blue', 'data:image/jpeg;base64,U0hPVA==')

    expect(writeSkinArt).toHaveBeenCalledWith('/cars/gtm', 'racing_blue', 'preview', 'U0hPVA==')
    unmount()
  })

  /// The backend wants base64, not a data URL, and a silently mangled payload
  /// would land on disk as an unopenable file.
  it('refuses something that is not a data URL', async () => {
    const { result, unmount } = await withSetup(() => useSkinArt())

    await expect(result.savePreview('/cars/gtm', 'racing_blue', 'nonsense')).rejects.toThrow(
      'Not a data URL',
    )
    unmount()
  })

  it('reports while a write is in flight and stops when it fails', async () => {
    const { result, unmount } = await withSetup(() => useSkinArt())
    writeSkinArt.mockRejectedValueOnce(new Error('disk full'))

    await expect(result.saveBadge('/cars/gtm', 'racing_blue', '24')).rejects.toThrow('disk full')

    expect(result.isSaving.value).toBe(false)
    unmount()
  })

  describe('picking which texture the badge speaks for', () => {
    /// The categoriser guesses from the file name, so a whole-car sheet called
    /// anything but `body` lands in `other` — which is most mod cars.
    it('takes the biggest sheet the skin paints on, whatever it is called', () => {
      useTextures().textures.value = [
        texture({
          id: 'small',
          name: 'body_detail.dds',
          category: 'body',
          width: 512,
          height: 512,
        }),
        texture({
          id: 'chassis',
          name: '2026_Chassis_P.dds',
          category: 'other',
          width: 7168,
          height: 3584,
        }),
      ]

      expect(pickedId()).toBe('chassis')
    })

    /// A category looks like the better filter and is not: it is a guess from
    /// the file name, and preferring it let a 512 detail sheet outrank a 7168
    /// one carrying the whole car.
    it('does not let the categoriser outrank the bigger sheet', () => {
      useTextures().textures.value = [
        texture({ id: 'detail', category: 'body', width: 512, height: 512 }),
        texture({ id: 'chassis', category: 'other', width: 7168, height: 3584 }),
      ]

      expect(pickedId()).toBe('chassis')
    })

    /// A texture this skin never touches still wears the donor car's colours,
    /// which is not what this livery looks like.
    it('ignores a sheet the skin does not paint on', () => {
      useTextures().textures.value = [
        texture({ id: 'donor', source: 'kn5', width: 4096, height: 4096 }),
        texture({ id: 'mine', source: 'skin', width: 1024, height: 1024 }),
      ]

      expect(pickedId()).toBe('mine')
    })

    it('counts a queued replacement as a sheet the skin paints on', () => {
      useTextures().textures.value = [
        texture({ id: 'donor', source: 'kn5', width: 4096, height: 4096 }),
        texture({
          id: 'queued',
          source: 'carOverride',
          width: 1024,
          height: 1024,
          replacement: { sourcePath: '/art/body.png', previewUrl: 'data:,', width: 1, height: 1 },
        }),
      ]

      expect(pickedId()).toBe('queued')
    })
  })
})
