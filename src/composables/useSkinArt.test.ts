import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { useSkinMeta } from '@/composables/useSkinMeta'
import { FALLBACK_COLOURS } from '@/lib/liveryBadge'
import { STUBBED_DATA_URL, stubCanvas } from '@/test-fixtures/canvas'
import type { Texture } from '@/types/index'
import { liveryTexture, PREVIEW_SIZE, useSkinArt } from './useSkinArt'
import { useSkinPicker } from './useSkinPicker'
import { useTextures } from './useTextures'

const { writeSkinArt, sampleTextureColours, mainLiveryTexture } = vi.hoisted(() => ({
  writeSkinArt: vi.fn(async () => '/written/path'),
  sampleTextureColours: vi.fn(async () => ['#ea6e14', '#0c0c0c']),
  mainLiveryTexture: vi.fn(async () => null as string | null),
}))

const captureSkinPreview = vi.hoisted(() =>
  vi.fn(async () => ({ shot: 'data:image/jpeg;base64,U0hPVA==', failed: ['glass.dds'] })),
)
vi.mock('@/composables/useSkinPreviewShot', () => ({ captureSkinPreview }))

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>()
  return { ...actual, writeSkinArt, sampleTextureColours, mainLiveryTexture }
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
function pickedId(sheet?: string) {
  return liveryTexture(useTextures().textures.value, sheet)?.id
}

describe('useSkinArt', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useSkinMeta().reset()
    writeSkinArt.mockClear()
    sampleTextureColours.mockClear()
    mainLiveryTexture.mockClear()
    stubCanvas()
    useTextures().textures.value = []
  })

  it('falls back while no texture has been decoded', async () => {
    const { result, unmount } = await withSetup(() => useSkinArt())

    expect(result.badgeColours.value).toEqual(FALLBACK_COLOURS)
    unmount()
  })

  /// The backend counts the colours because it holds the full-resolution
  /// pixels: what reaches the webview is a 128 pixel thumbnail whose stripes
  /// have already been averaged into their neighbours.
  it('asks the backend for the file on disk, not the thumbnail it holds', async () => {
    useTextures().textures.value = [
      texture({ path: '/cars/gtm/skins/blue/body.dds', previewUrl: 'data:image/png;base64,tiny' }),
    ]
    const { result, unmount } = await withSetup(() => useSkinArt())
    await nextTick()

    expect(sampleTextureColours).toHaveBeenCalledWith({
      kind: 'file',
      path: '/cars/gtm/skins/blue/body.dds',
    })
    expect(result.badgeColours.value).toEqual(['#ea6e14', '#0c0c0c'])
    unmount()
  })

  /// The panel, the sidebar, and the preview dialog each call `useSkinArt()`
  /// from their own setup while mounted together — a second pair of watchers
  /// per caller doubled every request to the backend for the same answer.
  it('asks the backend once, however many callers share the car', async () => {
    const first = await withSetup(() => useSkinArt())
    const second = await withSetup(() => useSkinArt())

    useTextures().textures.value = [texture({ path: '/cars/gtm/skins/blue/body.dds' })]
    await nextTick()
    await nextTick()

    expect(sampleTextureColours).toHaveBeenCalledTimes(1)
    first.unmount()
    second.unmount()
  })

  /// A slower response from an earlier change landing after a newer one would
  /// leave the badge showing colours for a texture that is no longer picked.
  it('does not let a stale sample overwrite a newer one', async () => {
    let resolveFirst!: (colours: string[]) => void
    sampleTextureColours.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    )
    sampleTextureColours.mockResolvedValueOnce(['#00ff00'])

    const { result, unmount } = await withSetup(() => useSkinArt())
    useTextures().textures.value = [texture({ id: 'a', path: '/a.dds' })]
    await nextTick()

    useTextures().textures.value = [texture({ id: 'b', path: '/b.dds' })]
    await nextTick()
    await nextTick()

    resolveFirst(['#ff0000'])
    await nextTick()
    await nextTick()

    expect(result.badgeColours.value).toEqual(['#00ff00'])
    unmount()
  })

  /// A stock Kunos car keeps every texture inside its KN5 and leaves only the
  /// painted ones on disk, so a path is no answer for most of them.
  it('reads a texture out of the KN5 when that is where it lives', async () => {
    useTextures().textures.value = [
      texture({
        name: 'f40_body.dds',
        source: 'carOverride',
        path: '/cars/ks_ferrari_f40/f40.kn5',
        kn5File: '/cars/ks_ferrari_f40/f40.kn5',
      }),
    ]
    const { unmount } = await withSetup(() => useSkinArt())
    await nextTick()

    expect(sampleTextureColours).toHaveBeenCalledWith({
      kind: 'embedded',
      kn5: '/cars/ks_ferrari_f40/f40.kn5',
      name: 'f40_body.dds',
    })
    unmount()
  })

  /// `kn5File` on a `kn5`-sourced texture is the scan's bare filename, not a
  /// path the backend could open — `path` is the kn5 the scan actually read.
  it('opens the kn5 by its path, not the bare filename the scan recorded', async () => {
    useTextures().textures.value = [
      texture({
        name: 'body.dds',
        source: 'kn5',
        path: '/cars/gtm/gtm.kn5',
        kn5File: 'gtm.kn5',
      }),
    ]
    const { unmount } = await withSetup(() => useSkinArt())
    await nextTick()

    expect(sampleTextureColours).toHaveBeenCalledWith({
      kind: 'embedded',
      kn5: '/cars/gtm/gtm.kn5',
      name: 'body.dds',
    })
    unmount()
  })

  /// What the queue is about to write outranks the KN5 it came from: the badge
  /// shows what a repack would produce, not what shipped.
  it('speaks for the image a queued replacement is about to write', async () => {
    useTextures().textures.value = [
      texture({
        replacement: { sourcePath: '/art/body.png', previewUrl: 'data:,', width: 1, height: 1 },
      }),
    ]
    const { unmount } = await withSetup(() => useSkinArt())
    await nextTick()

    expect(sampleTextureColours).toHaveBeenCalledWith({ kind: 'file', path: '/art/body.png' })
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

  /// The skin on disk is the donor; the fork it is being renamed into does not
  /// exist yet. Only its own images may be replaced.
  it('will not write into the skin a fork was opened from', async () => {
    const { result, unmount } = await withSetup(() => useSkinArt())
    const { load, meta } = useSkinMeta()
    load({ name: 'ks_default', previewUrl: null, textureCount: 1 })
    if (meta.value) meta.value.folderName = '27_ks_default'

    await expect(result.saveBadge('/cars/gtm', 'ks_default', '27')).rejects.toThrow(
      /27_ks_default is a new skin/,
    )
    await expect(result.savePreview('/cars/gtm', 'ks_default', STUBBED_DATA_URL)).rejects.toThrow(
      /name it ks_default again/,
    )
    expect(writeSkinArt).not.toHaveBeenCalled()
    expect(result.isSaving.value).toBe(false)
    unmount()
  })

  /// The archive carries its own pictures, so nothing is written to disk here:
  /// a renamed skin has no folder to write into, and the donor's must not be.
  it('renders both images for an export without writing either', async () => {
    const { result, unmount } = await withSetup(() => useSkinArt())

    const { art, failed } = await result.renderArt('/cars/gtm', 'racing_blue', '24')

    expect(captureSkinPreview).toHaveBeenCalledWith('/cars/gtm', 'racing_blue', [], PREVIEW_SIZE)
    expect(art.preview).toBe('U0hPVA==')
    expect(art.livery).toBe(STUBBED_DATA_URL.split(',')[1])
    expect(failed).toEqual(['glass.dds'])
    expect(writeSkinArt).not.toHaveBeenCalled()
    unmount()
  })

  it('sends the preview capture on as it is handed over', async () => {
    const { result, unmount } = await withSetup(() => useSkinArt())

    await result.savePreview('/cars/gtm', 'racing_blue', 'data:image/jpeg;base64,U0hPVA==')

    expect(writeSkinArt).toHaveBeenCalledWith('/cars/gtm', 'racing_blue', 'preview', 'U0hPVA==')
    unmount()
  })

  /// A badge that quietly falls back to grey looks exactly like a car painted
  /// grey, and the model is read from a folder the user only just picked.
  it('says so when the car model will not name its livery sheet', async () => {
    mainLiveryTexture.mockRejectedValueOnce(new Error('no model in this folder'))
    const { result, unmount } = await withSetup(() => useSkinArt())

    useSkinPicker().carPath.value = '/cars/broken'
    await nextTick()
    await Promise.resolve()

    expect(result.badgeError.value).toBe('no model in this folder')
    unmount()
  })

  /// Nothing rescans the skin folder after a write, so the panel would keep
  /// showing the image that was replaced, at the size it used to be.
  it('puts the written preview back into the texture list', async () => {
    useTextures().textures.value = [
      texture({
        id: 'old-preview',
        name: 'preview.jpg',
        path: 'skins/racing_blue/preview.jpg',
        category: 'preview',
        width: 1920,
        height: 1080,
        format: 'JPEG',
        previewUrl: 'data:image/jpeg;base64,T0xE',
      }),
    ]
    const { result, unmount } = await withSetup(() => useSkinArt())

    await result.savePreview('/cars/gtm', 'racing_blue', 'data:image/jpeg;base64,U0hPVA==')

    expect(useTextures().textures.value).toHaveLength(1)
    expect(useTextures().textures.value[0]).toMatchObject({
      id: 'old-preview',
      width: 1024,
      height: 575,
      previewUrl: 'data:image/jpeg;base64,U0hPVA==',
    })
    unmount()
  })

  it('lists a badge the skin did not have before', async () => {
    useTextures().textures.value = []
    const { result, unmount } = await withSetup(() => useSkinArt())

    await result.saveBadge('/cars/gtm', 'racing_blue', '24')

    expect(useTextures().textures.value).toMatchObject([
      {
        name: 'livery.png',
        path: 'skins/racing_blue/livery.png',
        category: 'preview',
        source: 'skin',
        format: 'PNG',
        width: 128,
        height: 128,
      },
    ])
    unmount()
  })

  /// A list showing an image no file answers for is worse than one showing the
  /// image that is still there.
  it('leaves the list alone when the write failed', async () => {
    useTextures().textures.value = []
    writeSkinArt.mockRejectedValueOnce(new Error('disk full'))
    const { result, unmount } = await withSetup(() => useSkinArt())

    await expect(result.saveBadge('/cars/gtm', 'racing_blue', '24')).rejects.toThrow('disk full')

    expect(useTextures().textures.value).toEqual([])
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

    /// The badge's own picture, and the selection-screen shot beside it, are
    /// both `skin`-sourced files too — without this, a car whose real livery
    /// sheet is still unpainted in the KN5 would have the badge sample its
    /// own prior output, or the whole-car preview render, as the car's colour.
    it('never picks the preview images as the livery sheet', () => {
      useTextures().textures.value = [
        texture({ id: 'preview', name: 'preview.jpg', category: 'preview', width: 1024 * 4 }),
        texture({ id: 'badge', name: 'livery.png', category: 'preview', width: 1024 * 4 }),
        texture({ id: 'sheet', name: 'body.dds', category: 'other', width: 512 }),
      ]

      expect(pickedId()).toBe('sheet')
    })

    it('does not name-match a preview image either', () => {
      useTextures().textures.value = [
        texture({ id: 'preview', name: 'skin_00.dds', category: 'preview' }),
        texture({ id: 'sheet', name: 'skin_00b.dds', category: 'other' }),
      ]

      expect(pickedId('skin_00.dds')).toBe('sheet')
    })

    /// The car's own model names the texture on its bodywork, and nothing else
    /// can: a mask ships at the livery's exact resolution, so measuring the
    /// files ends in a tie the decoder's order breaks — which drew a black and
    /// white badge off a series mask for an orange car.
    it('takes the sheet the car model names, whatever its size', () => {
      useTextures().textures.value = [
        texture({ id: 'mask', name: 'EXT_Series_Mask.png', width: 7168, height: 3584 }),
        texture({ id: 'livery', name: '2026_Chassis_P.dds', width: 7168, height: 3584 }),
      ]

      expect(pickedId('2026_chassis_p.dds')).toBe('livery')
    })

    /// A stock car keeps its livery in the KN5 and its skins repaint only the
    /// plates and the crew, so the sheet the model names is not one the skin
    /// owns — and restricting to owned files marked the number plate.
    it('takes the sheet the model names even when the skin never touched it', () => {
      useTextures().textures.value = [
        texture({ id: 'plate', name: 'Plate_D.dds', source: 'skin' }),
        texture({
          id: 'livery',
          name: 'Skin_00.dds',
          source: 'carOverride',
          kn5File: '/cars/gtr/gtr.kn5',
        }),
      ]

      expect(pickedId('skin_00.dds')).toBe('livery')
    })

    it('falls back to size when the model names a sheet this car has not decoded', () => {
      useTextures().textures.value = [
        texture({ id: 'small', width: 512, height: 512 }),
        texture({ id: 'big', width: 4096, height: 4096 }),
      ]

      expect(pickedId('something_else.dds')).toBe('big')
    })

    /// A skin spells a texture however the artist typed it, and the model
    /// however the exporter did.
    it('matches the model spelling against the skin spelling', () => {
      useTextures().textures.value = [
        texture({ id: 'mask', name: 'EXT_Series_Mask.png', width: 7168, height: 3584 }),
        texture({ id: 'livery', name: 'Body.DDS', width: 512, height: 512 }),
      ]

      expect(pickedId('body.dds')).toBe('livery')
    })

    /// Before the model has been read there is nothing to filter on, and an
    /// empty set must not be taken for a car that wears no colour at all.
    it('picks on size alone while the model has not been read', () => {
      useTextures().textures.value = [
        texture({ id: 'small', width: 512, height: 512 }),
        texture({ id: 'big', width: 4096, height: 4096 }),
      ]

      expect(pickedId()).toBe('big')
    })

    it('falls back to the sheet the author painted when the model names none', () => {
      useTextures().textures.value = [
        texture({ id: 'mask', name: 'EXT_Series_Mask.png', width: 7168, height: 3584 }),
        texture({
          id: 'livery',
          name: '2026_Chassis_P.dds',
          width: 7168,
          height: 3584,
          replacement: { sourcePath: '/art/body.png', previewUrl: 'data:,', width: 1, height: 1 },
        }),
      ]

      expect(pickedId()).toBe('livery')
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

  describe('when the badge cannot read the car', () => {
    /// A badge that quietly gives up looks exactly like a car painted grey, and
    /// the sidebar had been showing one for a fully painted livery.
    it('says why it fell back rather than showing grey in silence', async () => {
      useTextures().textures.value = [texture()]
      sampleTextureColours.mockRejectedValueOnce(new Error('unsupported file type: kn5'))

      const { result, unmount } = await withSetup(() => useSkinArt())
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(result.badgeColours.value).toEqual(FALLBACK_COLOURS)
      expect(result.badgeError.value).toMatch(/unsupported file type/)
      unmount()
    })

    /// A sheet with nothing opaque on it is a real answer, and one the badge
    /// cannot paint — saying so beats a grey badge that looks like a grey car.
    it('says so when the sheet has no paint on it', async () => {
      useTextures().textures.value = [texture()]
      sampleTextureColours.mockResolvedValueOnce([])

      const { result, unmount } = await withSetup(() => useSkinArt())
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(result.badgeError.value).toMatch(/Nothing painted/)
      unmount()
    })

    it('has nothing to say while no texture has been decoded', async () => {
      const { result, unmount } = await withSetup(() => useSkinArt())

      expect(result.badgeError.value).toBeNull()
      unmount()
    })
  })
})
