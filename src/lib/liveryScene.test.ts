import { ACESFilmicToneMapping, BufferGeometry } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveryModel } from '@/types/index'

/// What the renderer was last handed, so the scene's own lighting is readable
/// without a GPU.
interface RenderedScene {
  environment: unknown
  environmentIntensity: number
  background: unknown
}

/// What the renderer was handed, as it was at the time and as it is now.
let rendered: RenderedScene | null = null
let live: RenderedScene | null = null

const { renderer, loader, buildGeometry, frameHero } = vi.hoisted(() => ({
  renderer: {
    setPixelRatio: vi.fn(),
    getPixelRatio: vi.fn(() => 2),
    getSize: vi.fn(() => ({ x: 800, y: 450 })),
    setSize: vi.fn(),
    setClearColor: vi.fn(),
    render: vi.fn((scene: RenderedScene) => {
      // Copied as well as held: the scene puts its backdrop away afterwards, so
      // a reference alone would show it already gone.
      rendered = { ...scene }
      live = scene
    }),
    dispose: vi.fn(),
    toneMapping: 0,
    toneMappingExposure: 1,
  },
  /// Every load is held so a test can decide, per texture, whether it arrives.
  loader: { settle: [] as Array<(ok: boolean) => void> },
  buildGeometry: vi.fn(() => new BufferGeometry()),
  frameHero: vi.fn(),
}))

vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>()
  return {
    ...three,
    WebGLRenderer: function WebGLRenderer(this: unknown) {
      return renderer
    } as unknown as typeof three.WebGLRenderer,
    PMREMGenerator: class {
      fromScene() {
        return { texture: {}, dispose: vi.fn() }
      }
    },
    TextureLoader: class {
      load(_url: string, onLoad: () => void, _p: unknown, onError: () => void) {
        loader.settle.push((ok: boolean) => (ok ? onLoad() : onError()))
        return { dispose: vi.fn(), colorSpace: '', flipY: true }
      }
    },
  }
})

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    target = { copy: vi.fn() }
    enableDamping = false
    update = vi.fn()
    dispose = vi.fn()
  },
}))

vi.mock('@/lib/threeUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/threeUtils')>()
  return { ...actual, buildGeometry, frameHero }
})

import { createLiveryScene } from './liveryScene'

function model(textures: string[] = []): LiveryModel {
  return {
    mesh: {} as LiveryModel['mesh'],
    groups: [],
    textures: textures.map((name, index) => ({ name, url: `livery://localhost/1/${index}` })),
  }
}

function canvas() {
  const element = document.createElement('canvas')
  element.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement['getContext']
  element.toDataURL = vi.fn(() => 'data:image/jpeg;base64,U0hPVA==')
  return element
}

describe('createLiveryScene', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loader.settle = []
    rendered = null
    live = null
    // jsdom draws nothing, and the backdrop is a gradient on a 2D context.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      fillRect: vi.fn(),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D)
    buildGeometry.mockImplementation(() => new BufferGeometry())
  })

  /// The capture is the scene's one and only frame in the sidebar, so a texture
  /// that never answers must not hold it open for ever.
  it('settles once every texture has loaded or given up', async () => {
    const scene = createLiveryScene(canvas(), model(['body.dds', 'grills.dds']))
    let settled = false
    scene.ready.then(() => {
      settled = true
    })

    loader.settle[0](true)
    await Promise.resolve()
    expect(settled).toBe(false)

    loader.settle[1](false)
    await scene.ready
    expect(settled).toBe(true)
  })

  /// A texture that did not load leaves its panels black, which reads as a paint
  /// choice rather than as a failure unless something says otherwise.
  it('names each texture that would not load', async () => {
    const failed: string[] = []
    const scene = createLiveryScene(canvas(), model(['body.dds', 'grills.dds']), (name) =>
      failed.push(name),
    )

    loader.settle[0](true)
    loader.settle[1](false)
    await scene.ready

    expect(failed).toEqual(['grills.dds'])
  })

  /// Car paint is a mirror before it is a colour, and lamps alone give it
  /// nothing to reflect. Filmic tone mapping is what keeps the highlight off a
  /// white flank from clipping to paper once it has a room to reflect.
  it('lights the car with something to reflect', () => {
    createLiveryScene(canvas(), model())

    expect(renderer.toneMapping).toBe(ACESFilmicToneMapping)
    expect(renderer.toneMappingExposure).toBeLessThanOrEqual(1)
  })

  /// The room lights every surface at once, so at full strength it burns a white
  /// flank to paper — and half a GT field is mostly white.
  it('holds the room back from blowing the paint out', () => {
    const scene = createLiveryScene(canvas(), model())
    scene.render()

    expect(rendered?.environmentIntensity).toBeLessThan(1)
    expect(rendered?.environment).not.toBeNull()
  })

  describe('capture', () => {
    it('takes the picture at the size asked for, not the viewer’s', () => {
      const scene = createLiveryScene(canvas(), model())

      scene.capture(1024, 575)

      expect(renderer.setSize).toHaveBeenCalledWith(1024, 575, false)
    })

    /// A preview is a fixed size whatever screen it was taken on, and the
    /// viewer is still on screen behind it.
    it('puts the viewer back the size it was', () => {
      const scene = createLiveryScene(canvas(), model())

      scene.capture(1024, 575)

      expect(renderer.setSize).toHaveBeenLastCalledWith(800, 450, false)
      expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(2)
    })

    /// JPEG carries no alpha, so a background left transparent comes out black.
    it('paints the background in before reading the canvas back', () => {
      const scene = createLiveryScene(canvas(), model())

      expect(scene.capture(1024, 575)).toBe('data:image/jpeg;base64,U0hPVA==')
      const [colour] = renderer.setClearColor.mock.calls[0]
      expect(renderer.setClearColor).toHaveBeenNthCalledWith(1, colour, 1)
      expect(renderer.setClearColor).toHaveBeenLastCalledWith(colour, 0)
    })

    /// The viewer is a panel in a window that has its own background, and a
    /// backdrop left standing behind the car would box it in.
    it('puts the studio up for the shot and takes it down after', () => {
      const scene = createLiveryScene(canvas(), model())

      scene.capture(1024, 575)

      expect(rendered?.background).not.toBeNull()
      expect(live?.background).toBeNull()
    })
  })

  it('frames the car on demand rather than on every render', () => {
    const scene = createLiveryScene(canvas(), model())
    expect(frameHero).not.toHaveBeenCalled()

    scene.frameHero()

    expect(frameHero).toHaveBeenCalled()
  })

  /// A browser keeps only a handful of WebGL contexts alive and drops the oldest
  /// when a new one is asked for, so a scene that leaks one costs the viewer
  /// that is still open.
  it('gives up the context when it cannot finish building', () => {
    const lose = vi.fn()
    const element = canvas()
    element.getContext = vi.fn(() => ({
      getExtension: () => ({ loseContext: lose }),
    })) as unknown as HTMLCanvasElement['getContext']
    buildGeometry.mockImplementation(() => {
      throw new Error('mesh will not decode')
    })

    expect(() => createLiveryScene(element, model())).toThrow('mesh will not decode')
    expect(lose).toHaveBeenCalled()
  })

  it('releases what it holds', () => {
    const scene = createLiveryScene(canvas(), model(['body.dds']))

    scene.dispose()

    expect(renderer.dispose).toHaveBeenCalled()
  })
})
