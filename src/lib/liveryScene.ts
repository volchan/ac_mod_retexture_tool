import {
  AmbientLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector2,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildGeometry, frameCamera, keyLight } from '@/lib/threeUtils'
import type { LiveryModel } from '@/types/index'

export interface LiveryScene {
  render: () => void
  resize: (width: number, height: number) => void
  /// The car as it is framed right now, at the size asked for, as a JPEG data
  /// URL. The viewer's own size is restored before this returns.
  capture: (width: number, height: number, quality?: number) => string
  dispose: () => void
}

/// JPEG cannot carry the alpha the viewer renders with, and an unpainted
/// background would come out black. AC's own previews sit on a pale studio grey.
const CAPTURE_BACKGROUND = 0xf2f2f2

/// The whole car wearing the whole skin: one draw per material, orbitable, and
/// read-only — unlike the editor's preview there is nothing here to pick at.
export function createLiveryScene(
  canvas: HTMLCanvasElement,
  model: LiveryModel,
  onTextureError?: (name: string) => void,
): LiveryScene {
  const geometry = buildGeometry(model.mesh)
  const loaded: Texture[] = model.textures.map((entry) =>
    loadTexture(entry.url, () => onTextureError?.(entry.name)),
  )

  const materials = model.groups.map((group, index) => {
    // Konva and the KN5 both count V upwards, so the merged buffer carries the
    // flip already; asking three for another one would stand the paint on its head.
    geometry.addGroup(group.start * 3, group.count * 3, index)
    return materialFor(group, loaded)
  })

  const scene = new Scene()
  scene.add(new Mesh(geometry, materials))
  scene.add(new AmbientLight(0xffffff, 1.4))
  scene.add(keyLight(1.2, [3, 5, 4]), keyLight(0.6, [-4, 2, -3]))

  // `preserveDrawingBuffer` is what lets a capture read the canvas back at all:
  // without it the buffer is cleared on composite and toDataURL sees black.
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(window.devicePixelRatio)

  const camera = new PerspectiveCamera(38, 1, 0.05, 100)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  frameCamera(camera, controls, geometry)

  return {
    render() {
      controls.update()
      renderer.render(scene, camera)
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
      renderer.dispose()
    },
  }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

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

function loadTexture(url: string, onError: () => void): Texture {
  const texture = new TextureLoader().load(url, undefined, undefined, onError)
  texture.flipY = false
  return texture
}
