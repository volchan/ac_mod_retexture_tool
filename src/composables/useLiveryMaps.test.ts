import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { bucketLayer } from '@/test-fixtures/layers'
import type { EditorLayer, Texture } from '@/types/index'

vi.mock('@/lib/tauri', () => ({
  liveryMaps: vi.fn(async () => ['Chassis_AO.png']),
  cleanLiveryMaps: vi.fn(async () => ({
    sourcePath: '/data/livery_edits/chassis_ao.clean.png',
    previewUrl: 'data:image/png;base64,Q0xFQU4=',
  })),
}))

const textures = ref<Texture[]>([])
const applyReplacements = vi.fn()
vi.mock('@/composables/useTextures', () => ({
  useTextures: () => ({ textures, applyReplacements }),
}))

const coverageToCanvas = vi.fn((..._args: unknown[]) => ({
  toDataURL: () => 'data:image/png;base64,Q09WRVI=',
}))
vi.mock('@/lib/stageExport', () => ({
  coverageToCanvas: (...args: unknown[]) => coverageToCanvas(...args),
}))

import type Konva from 'konva'
import { cleanLiveryMaps, liveryMaps } from '@/lib/tauri'
import { useLiveryMaps } from './useLiveryMaps'

const stage = {} as Konva.Stage

function texture(name: string, extra: Partial<Texture> = {}): Texture {
  return {
    id: name,
    name,
    path: `/cars/furiano/skins/07/${name}`,
    width: 4096,
    height: 4096,
    ...extra,
  } as Texture
}

const sheet = texture('Chassis.png')

describe('useLiveryMaps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    textures.value = [sheet, texture('chassis_ao.PNG'), texture('Gen_Map.dds')]
  })

  it('cleans the finish the model pairs with the sheet and queues it', async () => {
    const cleaned = await useLiveryMaps().clearUnder(stage, sheet, '/cars/furiano', [])

    expect(liveryMaps).toHaveBeenCalledWith('/cars/furiano', 'Chassis.png')
    expect(cleaned).toEqual(['chassis_ao.PNG'])
    expect(cleanLiveryMaps).toHaveBeenCalledWith(
      { kind: 'file', path: '/cars/furiano/skins/07/chassis_ao.PNG' },
      expect.any(String),
      'data:image/png;base64,Q09WRVI=',
    )
    expect(applyReplacements).toHaveBeenCalledWith([
      expect.objectContaining({
        sourcePath: '/data/livery_edits/chassis_ao.clean.png',
        sourceWidth: 4096,
        hasDimensionMismatch: false,
      }),
    ])
  })

  /// A finish at another size is laid out for something else, and cleaning it
  /// where the sheet was covered would scrub an unrelated part of the car.
  it('leaves a paired finish of another size alone', async () => {
    textures.value = [sheet, texture('Chassis_AO.png', { width: 1024, height: 1024 })]

    const cleaned = await useLiveryMaps().clearUnder(stage, sheet, '/cars/furiano', [])

    expect(cleaned).toEqual([])
    expect(coverageToCanvas).not.toHaveBeenCalled()
    expect(applyReplacements).not.toHaveBeenCalled()
  })

  /// A tint keeps the lettering under it visible, so the finish must keep it too;
  /// a whole-sheet fill would flatten the carbon and the chrome into paint.
  it('leaves tints and whole-sheet fills out of the coverage', async () => {
    const layers: EditorLayer[] = [
      bucketLayer({ id: 'cover', blend: 'source-over' }),
      bucketLayer({ id: 'tint', blend: 'color' }),
      bucketLayer({ id: 'everything', blend: 'source-over', mode: 'sheet' }),
    ]

    await useLiveryMaps().clearUnder(stage, sheet, '/cars/furiano', layers)

    expect(coverageToCanvas).toHaveBeenCalledWith(stage, 4096, 4096, ['tint', 'everything'])
  })

  /// Cleaned from the car's own finish every time, so a sticker taken off the
  /// sheet gives the panel its finish back instead of keeping the last clean.
  it('rebuilds a finish it cleaned before from the original', async () => {
    textures.value = [
      sheet,
      texture('Chassis_AO.png', {
        replacement: {
          sourcePath: '/data/livery_edits/chassis_ao.clean.png',
          previewUrl: '',
          width: 4096,
          height: 4096,
        },
      }),
    ]

    await useLiveryMaps().clearUnder(stage, sheet, '/cars/furiano', [])

    expect(cleanLiveryMaps).toHaveBeenCalledWith(
      { kind: 'file', path: '/cars/furiano/skins/07/Chassis_AO.png' },
      expect.any(String),
      expect.any(String),
    )
  })

  it('cleans a finish the user imported rather than discarding it', async () => {
    textures.value = [
      sheet,
      texture('Chassis_AO.png', {
        replacement: {
          sourcePath: '/imports/my_ao.png',
          previewUrl: '',
          width: 4096,
          height: 4096,
        },
      }),
    ]

    await useLiveryMaps().clearUnder(stage, sheet, '/cars/furiano', [])

    expect(cleanLiveryMaps).toHaveBeenCalledWith(
      { kind: 'file', path: '/imports/my_ao.png' },
      expect.any(String),
      expect.any(String),
    )
  })

  it('says so when a finish has nowhere to be read from', async () => {
    textures.value = [sheet, texture('Chassis_AO.png', { path: '' })]

    await expect(useLiveryMaps().clearUnder(stage, sheet, '/cars/furiano', [])).rejects.toThrow(
      'Chassis_AO.png',
    )
    expect(useLiveryMaps().isClearing.value).toBe(false)
  })
})
