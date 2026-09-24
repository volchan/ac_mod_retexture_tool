import {
  ACESFilmicToneMapping,
  AmbientLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector2,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildGeometry, frameCamera, frameHero, keyLight } from '@/lib/threeUtils'
import type { LiveryModel } from '@/types/index'

export interface LiveryScene {
  /// Settles once every texture has loaded or given up. A capture taken before
  /// this resolves draws an untextured car.
  ready: Promise<void>
  render: () => void
  resize: (width: number, height: number) => void
  /// Puts the camera where AC shoots its own previews. The dialog leaves the
  /// framing to whoever is orbiting it; a capture taken with nobody watching
  /// has to choose one, and the orbit default is a distant view from above.
  frameHero: () => void
  /// The car as it is framed right now, at the size asked for, as a JPEG data
  /// URL. The viewer's own size is restored before this returns.
  capture: (width: number, height: number, quality?: number) => string
  dispose: () => void
}

/// JPEG cannot carry the alpha the viewer renders with, and an unpainted
/// background would come out black. A studio grey rather than white: half the
/// cars in a GT field are mostly white, and on paper they have no edges.
const CAPTURE_BACKGROUND = 0xd8dade

/// How much of the room reaches the car. This is the exposure knob, not the
/// lamps and not the tone mapping: the room lights every surface at once, so at
/// full strength it burns a white flank to paper and takes the panel lines with
/// it, and turning the lamps down barely shows.
const ENVIRONMENT = 0.55

/// What the lamps are worth once the room is doing the lighting: the highlight
/// down an edge, and nothing else.
const AMBIENT = 0.15
const KEY_LIGHT = 0.55
const FILL_LIGHT = 0.25
const EXPOSURE = 1.0

/// The whole car wearing the whole skin: one draw per material, orbitable, and
/// read-only — unlike the editor's preview there is nothing here to pick at.
export function createLiveryScene(
  canvas: HTMLCanvasElement,
  model: LiveryModel,
  onTextureError?: (name: string) => void,
): LiveryScene {
  // Everything allocated below is a GPU resource, and the caller can only
  // release what it was handed: a throw partway through would leave a context,
  // a geometry and forty textures with nobody left holding them.
  try {
    return buildScene(canvas, model, onTextureError)
  } catch (e) {
    disposeContext(canvas)
    throw e
  }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// Gives up the WebGL context a half-built scene left behind. A browser keeps
/// only a handful of them alive and drops the oldest when a new one is asked
/// for, so a leak here costs the viewer that is still open.
function disposeContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
  const lose = (context as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')
  lose?.loseContext()
}

function buildScene(
  canvas: HTMLCanvasElement,
  model: LiveryModel,
  onTextureError?: (name: string) => void,
): LiveryScene {
  const geometry = buildGeometry(model.mesh)
  const settled: Promise<void>[] = []
  const loaded: Texture[] = model.textures.map((entry) => {
    const { texture, done } = loadTexture(entry.url, () => onTextureError?.(entry.name))
    settled.push(done)
    return texture
  })

  const materials = model.groups.map((group, index) => {
    // Konva and the KN5 both count V upwards, so the merged buffer carries the
    // flip already; asking three for another one would stand the paint on its head.
    geometry.addGroup(group.start * 3, group.count * 3, index)
    return materialFor(group, loaded)
  })

  const scene = new Scene()
  scene.add(new Mesh(geometry, materials))
  scene.add(new AmbientLight(0xffffff, AMBIENT))
  scene.add(keyLight(KEY_LIGHT, [3, 5, 4]), keyLight(FILL_LIGHT, [-4, 2, -3]))

  // `preserveDrawingBuffer` is what lets a capture read the canvas back at all:
  // without it the buffer is cleared on composite and toDataURL sees black.
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(window.devicePixelRatio)

  // Car paint is a mirror before it is a colour, and lamps alone give it nothing
  // to reflect: the panels come out flat and the glass comes out grey. A room is
  // something to reflect, which is what the shots AC ships are lit with. Filmic
  // tone mapping keeps the highlight off a white flank from clipping to paper.
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = EXPOSURE
  const environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04)
  scene.environment = environment.texture
  scene.environmentIntensity = ENVIRONMENT

  const camera = new PerspectiveCamera(38, 1, 0.05, 100)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  frameCamera(camera, controls, geometry)

  return {
    ready: Promise.all(settled).then(() => undefined),
    render() {
      controls.update()
      renderer.render(scene, camera)
    },
    frameHero() {
      frameHero(camera, controls, geometry)
    },
    resize(width, height) {
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    },
    capture(width, height, quality = 0.9) {
      const restore = renderer.getSize(new Vector2())
      const pixelRatio = renderer.getPixelRatio()

      // A preview is a fixed size whatever screen it was taken on, so the
      // viewer's device ratio would only make the file four times heavier.
      renderer.setPixelRatio(1)
      renderer.setClearColor(CAPTURE_BACKGROUND, 1)
      this.resize(width, height)
      renderer.render(scene, camera)

      const shot = canvas.toDataURL('image/jpeg', quality)

      renderer.setPixelRatio(pixelRatio)
      renderer.setClearColor(CAPTURE_BACKGROUND, 0)
      this.resize(restore.x, restore.y)
      return shot
    },
    dispose() {
      controls.dispose()
      for (const texture of loaded) texture.dispose()
      for (const material of materials) material.dispose()
      geometry.dispose()
      environment.dispose()
      renderer.dispose()
    },
  }
}

function materialFor(
  group: LiveryModel['groups'][number],
  loaded: Texture[],
): MeshStandardMaterial {
  // -1 indexes nothing, so a group naming no texture falls through the lookup.
  const diffuse = loaded[group.diffuse ?? -1] ?? null
  const normal = loaded[group.normal ?? -1] ?? null

  if (diffuse) diffuse.colorSpace = SRGBColorSpace
  return new MeshStandardMaterial({
    map: diffuse,
    normalMap: normal,
    roughness: 0.45,
    metalness: 0.1,
  })
}

/// A texture that will not load is reported and then waited on no longer: a
/// single missing file must not hold a capture open for ever.
function loadTexture(url: string, onError: () => void): { texture: Texture; done: Promise<void> } {
  let settle = () => {}
  const done = new Promise<void>((resolve) => {
    settle = resolve
  })

  const texture = new TextureLoader().load(
    url,
    () => settle(),
    undefined,
    () => {
      onError()
      settle()
    },
  )
  texture.flipY = false
  return { texture, done }
}
