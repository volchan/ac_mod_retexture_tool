import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Texture } from '@/types/index'
import { captureSkinPreview, queuedOverrides } from './useSkinPreviewShot'

const { getLiveryModel, createLiveryScene, scene } = vi.hoisted(() => {
  const scene = {
    ready: Promise.resolve(),
    render: vi.fn(),
    resize: vi.fn(),
    capture: vi.fn(() => 'data:image/jpeg;base64,U0hPVA=='),
    frameHero: vi.fn(),
    dispose: vi.fn(),
  }
  return {
    scene,
    getLiveryModel: vi.fn(async () => ({ mesh: {}, groups: [], textures: [] })),
    createLiveryScene: vi.fn(() => scene),
  }
})

vi.mock('@/lib/tauri', () => ({ getLiveryModel }))
vi.mock('@/lib/liveryScene', () => ({ createLiveryScene }))

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

const SIZE = { width: 1024, height: 575 }

describe('captureSkinPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scene.ready = Promise.resolve()
  })

  it('hands back the frame it photographed', async () => {
    const { shot, failed } = await captureSkinPreview('/cars/gtm', 'racing_blue', [], SIZE)

    expect(shot).toBe('data:image/jpeg;base64,U0hPVA==')
    expect(failed).toEqual([])
    expect(scene.capture).toHaveBeenCalledWith(1024, 575)
  })

  /// Nobody is orbiting this scene, so nobody framed it: the orbit default sits
  /// far back and 24 degrees up, where a car is a small shape seen from above.
  it('frames the car before photographing it', async () => {
    await captureSkinPreview('/cars/gtm', 'racing_blue', [], SIZE)

    expect(scene.frameHero).toHaveBeenCalled()
    expect(scene.frameHero.mock.invocationCallOrder[0]).toBeLessThan(
      scene.capture.mock.invocationCallOrder[0],
    )
  })

  /// A texture that did not load leaves its panels black, and a car where none
  /// of them did is a silhouette — written out over a preview the skin already
  /// had, it replaces a picture of the car with a picture of nothing.
  it('refuses to save a car whose textures all failed', async () => {
    getLiveryModel.mockResolvedValueOnce({
      mesh: {},
      groups: [],
      textures: [{ name: 'body.dds', url: 'livery://1/0' }],
    })
    createLiveryScene.mockImplementationOnce((_canvas, _model, onError) => {
      onError?.('body.dds')
      return scene
    })

    await expect(captureSkinPreview('/cars/gtm', 'racing_blue', [], SIZE)).rejects.toThrow(
      'None of this car',
    )
    expect(scene.dispose).toHaveBeenCalled()
  })

  /// One sheet short still draws a car, and a skinner would rather have the
  /// picture and be told what is missing from it.
  it('hands back the names of the textures that did not load', async () => {
    getLiveryModel.mockResolvedValueOnce({
      mesh: {},
      groups: [],
      textures: [
        { name: 'body.dds', url: 'livery://1/0' },
        { name: 'grills.dds', url: 'livery://1/1' },
      ],
    })
    createLiveryScene.mockImplementationOnce((_canvas, _model, onError) => {
      onError?.('grills.dds')
      return scene
    })

    const { failed } = await captureSkinPreview('/cars/gtm', 'racing_blue', [], SIZE)

    expect(failed).toEqual(['grills.dds'])
  })

  /// Nothing drives this scene, so nothing would ever draw the textures in: the
  /// capture is its one and only frame, and an early one shows a blank car.
  it('waits for the textures before taking the picture', async () => {
    const order: string[] = []
    scene.ready = new Promise((resolve) =>
      queueMicrotask(() => {
        order.push('textures')
        resolve()
      }),
    )
    scene.capture.mockImplementation(() => {
      order.push('capture')
      return 'data:image/jpeg;base64,U0hPVA=='
    })

    await captureSkinPreview('/cars/gtm', 'racing_blue', [], SIZE)

    expect(order).toEqual(['textures', 'capture'])
  })

  it('throws the scene away whether or not the capture worked', async () => {
    scene.capture.mockImplementationOnce(() => {
      throw new Error('no webgl')
    })

    await expect(captureSkinPreview('/cars/gtm', 'racing_blue', [], SIZE)).rejects.toThrow(
      'no webgl',
    )
    expect(scene.dispose).toHaveBeenCalled()
  })

  it('draws the car at the size asked for', async () => {
    await captureSkinPreview('/cars/gtm', 'racing_blue', [], SIZE)

    const canvas = createLiveryScene.mock.calls[0][0] as HTMLCanvasElement
    expect(canvas).toMatchObject({ width: 1024, height: 575 })
  })
})

describe('queuedOverrides', () => {
  /// A preview of the files on disk would show the skin as it was before this
  /// session, which is not what the user is looking at.
  it('sends what the queue is about to write, not what is on disk', () => {
    const textures = [
      texture({
        name: 'body.dds',
        replacement: { sourcePath: '/art/body.png', previewUrl: '', width: 1, height: 1 },
      }),
      texture({ name: 'glass.dds' }),
    ]

    expect(queuedOverrides(textures)).toEqual([['body.dds', '/art/body.png']])
  })
})
