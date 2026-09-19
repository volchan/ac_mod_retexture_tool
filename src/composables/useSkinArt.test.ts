import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { shapeLayer } from '@/test-fixtures/layers'
import type { Texture } from '@/types/index'
import { useLiveryDocument } from './useLiveryDocument'
import { useSkinArt } from './useSkinArt'

const { writeSkinArt } = vi.hoisted(() => ({ writeSkinArt: vi.fn(async () => '/written/path') }))

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>()
  return { ...actual, writeSkinArt }
})

/// jsdom builds a real canvas element but gives it no 2D context and no
/// toDataURL, so both are stubbed. The drawing itself is covered by the badge's
/// own tests; what matters here is which bytes reach the backend.
const BADGE_DATA_URL = 'data:image/png;base64,QkFER0U='

function stubCanvas() {
  const create = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const element = create(tag)
    if (tag !== 'canvas') return element

    const canvas = element as HTMLCanvasElement
    canvas.getContext = (() => fakeContext()) as HTMLCanvasElement['getContext']
    canvas.toDataURL = () => BADGE_DATA_URL
    return canvas
  })
}

function fakeContext() {
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined),
    set: () => true,
  })
}

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

function texture(): Texture {
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
  }
}

describe('useSkinArt', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    writeSkinArt.mockClear()
    stubCanvas()
    useLiveryDocument().init(texture())
  })

  it('ranks the colours the open livery wears', async () => {
    const { result, unmount } = await withSetup(() => useSkinArt())
    const doc = useLiveryDocument()
    doc.addLayer(shapeLayer({ fill: '#1B4D8F', strokeWidth: 0, width: 500, height: 500 }))
    doc.addLayer(shapeLayer({ id: 'b', fill: '#E8E8E8', strokeWidth: 0, width: 20, height: 20 }))
    await nextTick()

    expect(result.badgeColours.value).toEqual(['#1B4D8F', '#E8E8E8'])
    unmount()
  })

  it('writes the badge under the skin it is given', async () => {
    const { result, unmount } = await withSetup(() => useSkinArt())

    const written = await result.saveBadge('/cars/gtm', 'racing_blue', '24')

    expect(written).toBe('/written/path')
    expect(writeSkinArt).toHaveBeenCalledWith('/cars/gtm', 'racing_blue', 'livery', 'QkFER0U=')
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
