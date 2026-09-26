import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/tauri', () => ({
  saveLiveryEdit: vi.fn(async () => '/data/livery_edits/skin_body_dds.png'),
  loadLiveryDocument: vi.fn(async () => null),
}))

const applyReplacements = vi.fn()
vi.mock('@/composables/useTextures', () => ({
  useTextures: () => ({ applyReplacements }),
}))

const stageToCanvas = vi.fn(() => ({ toDataURL: () => 'data:png,ratio-1' }))
vi.mock('@/lib/stageExport', () => ({
  stageToCanvas: (...args: unknown[]) => stageToCanvas(...args),
  thumbnailOf: (_sheet: unknown, ratio: number) => `data:png,ratio-${ratio}`,
  thumbnailRatio: () => 0.125,
}))

import type Konva from 'konva'
import { loadLiveryDocument, saveLiveryEdit } from '@/lib/tauri'
import type { Texture } from '@/types/index'
import { useLiveryDocument } from './useLiveryDocument'
import { useLiveryPersistence } from './useLiveryPersistence'

const texture = {
  id: 'tex1',
  name: 'skin_body.dds',
  path: 'skins/red_01/skin_body.dds',
  width: 2048,
  height: 1024,
} as Texture

const stage = {} as unknown as Konva.Stage

describe('useLiveryPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLiveryDocument().init(texture)
  })

  it('has nothing to restore for a texture never edited', async () => {
    expect(await useLiveryPersistence().restore(texture)).toBeUndefined()
  })

  it('restores a stored stack for the same texture', async () => {
    vi.mocked(loadLiveryDocument).mockResolvedValueOnce(
      JSON.stringify({ textureId: 'old', width: 2048, height: 1024, layers: [] }),
    )
    expect(await useLiveryPersistence().restore(texture)).toMatchObject({
      textureId: 'tex1',
      layers: [],
    })
  })

  it('refuses a stack saved against different texture dimensions', async () => {
    vi.mocked(loadLiveryDocument).mockResolvedValueOnce(
      JSON.stringify({ textureId: 'old', width: 512, height: 512, layers: [] }),
    )
    expect(await useLiveryPersistence().restore(texture)).toBeUndefined()
  })

  it('refuses a stack whose layers are not a list', async () => {
    vi.mocked(loadLiveryDocument).mockResolvedValueOnce(
      JSON.stringify({ textureId: 'old', width: 2048, height: 1024, layers: 'nope' }),
    )
    expect(await useLiveryPersistence().restore(texture)).toBeUndefined()
  })

  it('survives a corrupted stored stack', async () => {
    vi.mocked(loadLiveryDocument).mockResolvedValueOnce('{ not json')
    expect(await useLiveryPersistence().restore(texture)).toBeUndefined()
  })

  it('saves the flattened texture and the layer stack together', async () => {
    await useLiveryPersistence().save(stage, texture)
    expect(saveLiveryEdit).toHaveBeenCalledWith(
      expect.objectContaining({ pngBase64: 'data:png,ratio-1' }),
    )
    const call = vi.mocked(saveLiveryEdit).mock.calls[0][0]
    expect(JSON.parse(call.documentJson)).toMatchObject({ textureId: 'tex1' })
  })

  /// Flattening a 7168 pixel stage takes seconds; the thumbnail is cut from
  /// the one render rather than paid for twice.
  it('renders the stage once for both the file and the thumbnail', async () => {
    await useLiveryPersistence().save(stage, texture)
    expect(stageToCanvas).toHaveBeenCalledTimes(1)
    expect(stageToCanvas).toHaveBeenCalledWith(stage, 2048, 1024)
  })

  it('attaches the saved file as the texture replacement', async () => {
    await useLiveryPersistence().save(stage, texture)
    expect(applyReplacements).toHaveBeenCalledWith([
      {
        texture,
        sourcePath: '/data/livery_edits/skin_body_dds.png',
        previewUrl: 'data:png,ratio-0.125',
        sourceWidth: 2048,
        sourceHeight: 1024,
        hasDimensionMismatch: false,
      },
    ])
  })

  it('clears the saving flag when the write fails', async () => {
    vi.mocked(saveLiveryEdit).mockRejectedValueOnce(new Error('disk full'))
    const persistence = useLiveryPersistence()
    await expect(persistence.save(stage, texture)).rejects.toThrow('disk full')
    expect(persistence.isSaving.value).toBe(false)
    expect(applyReplacements).not.toHaveBeenCalled()
  })
})
