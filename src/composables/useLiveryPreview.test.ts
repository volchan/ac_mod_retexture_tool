import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLiveryModel } from '@/lib/tauri'
import type { LiveryModel, Texture } from '@/types/index'
import { useLiveryPreview } from './useLiveryPreview'

vi.mock('@/lib/tauri', () => ({
  getLiveryModel: vi.fn(),
}))

const model = { mesh: {}, groups: [], textures: [] } as unknown as LiveryModel

const plain = { id: 't1', name: 'body.dds' } as Texture
const queued = {
  id: 't2',
  name: 'Decals_EXT.dds',
  replacement: { sourcePath: '/tmp/decals.png', previewUrl: '', width: 8, height: 8 },
} as Texture

describe('useLiveryPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getLiveryModel).mockResolvedValue(model)
    useLiveryPreview().close()
  })

  it('starts closed with nothing loaded', () => {
    const { isOpen, model: loaded } = useLiveryPreview()
    expect(isOpen.value).toBe(false)
    expect(loaded.value).toBeNull()
  })

  it('opens the dialog before the model arrives, so the spinner shows', async () => {
    const { open, isOpen, isLoading, model: loaded } = useLiveryPreview()

    const pending = open('/cars/gtm', '01_red', [])
    expect(isOpen.value).toBe(true)
    expect(isLoading.value).toBe(true)

    await pending
    expect(isLoading.value).toBe(false)
    expect(loaded.value).toBe(model)
  })

  it('sends only the textures a replacement is queued for', async () => {
    await useLiveryPreview().open('/cars/gtm', '01_red', [plain, queued])

    expect(getLiveryModel).toHaveBeenCalledWith('/cars/gtm', '01_red', 1024, [
      ['Decals_EXT.dds', '/tmp/decals.png'],
    ])
  })

  it('surfaces a failure instead of an empty canvas', async () => {
    vi.mocked(getLiveryModel).mockRejectedValue(new Error('no car model in /cars/gtm'))
    const { open, error, isLoading } = useLiveryPreview()

    await open('/cars/gtm', '01_red', [])

    expect(error.value).toBe('no car model in /cars/gtm')
    expect(isLoading.value).toBe(false)
  })

  it('drops a model that arrives after the dialog closed', async () => {
    const { open, close, model: loaded } = useLiveryPreview()

    const pending = open('/cars/gtm', '01_red', [])
    close()
    await pending

    expect(loaded.value).toBeNull()
  })

  it('keeps only the newest request when a second skin opens', async () => {
    const second = {
      ...model,
      groups: [{ start: 0, count: 1, diffuse: null, normal: null }],
    } as LiveryModel
    const { open, model: loaded } = useLiveryPreview()
    vi.mocked(getLiveryModel).mockResolvedValueOnce(model).mockResolvedValueOnce(second)

    const first = open('/cars/gtm', '01_red', [])
    const latest = open('/cars/gtm', '02_blue', [])
    await Promise.all([first, latest])

    expect(loaded.value).toBe(second)
  })
})
