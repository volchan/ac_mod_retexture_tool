import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { FALLBACK_COLOURS } from '@/lib/liveryBadge'
import { STUBBED_DATA_URL, stubCanvas } from '@/test-fixtures/canvas'
import type { Texture } from '@/types/index'
import { useSkinArt } from './useSkinArt'
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

  it('leaves a skin that repaints only wheels and glass without a colour', async () => {
    useTextures().textures.value = [
      texture({ id: 'wheel', category: 'wheels', previewUrl: 'data:image/png;base64,AAA' }),
      texture({ id: 'glass', category: 'interior', previewUrl: 'data:image/png;base64,AAA' }),
    ]
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
})
