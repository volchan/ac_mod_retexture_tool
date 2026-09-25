import {
  AmbientLight,
  type BufferGeometry,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildGeometry, frameCamera, keyLight } from '@/lib/threeUtils'
import { buildUvIndex, locate } from '@/lib/uvIndex'
import type { CarMeshData } from '@/types/index'

/// Where the pointer landed on the car: the texture coordinate the editor draws
/// a marker at, and the part it belongs to.
export interface CarHover {
  u: number
  v: number
  part: string
}

export interface CarScene {
  render: () => void
  resize: (width: number, height: number) => void
  setTexture: (source: HTMLCanvasElement) => void
  /// The widest sheet this GPU will take as one texture.
  maxTextureSize: () => number
  /// `x` and `y` are fractions of the canvas, so the caller need not know its size.
  pick: (x: number, y: number) => CarHover | null
  /// Puts the marker on the panel that wears a given point of the texture.
  showAt: (u: number, v: number) => void
  dispose: () => void
}

/// Builds a lit, orbitable view of the panels wearing the texture being painted.
/// Everything it creates is returned through `dispose`, because a WebGL context
/// that outlives its canvas is a leak the browser will not collect on its own.
export function createCarScene(canvas: HTMLCanvasElement, data: CarMeshData): CarScene {
  const geometry = buildGeometry(data)
  const material = new MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 })
  const scene = new Scene()
  const car = new Mesh(geometry, material)
  scene.add(car)

  const marker = new Mesh(
    new SphereGeometry(markerRadius(geometry), 16, 12),
    new MeshBasicMaterial({ color: new Color(0x38bdf8) }),
  )
  marker.visible = false
  scene.add(marker)
  scene.add(new AmbientLight(0xffffff, 1.4))
  scene.add(keyLight(1.2, [3, 5, 4]), keyLight(0.6, [-4, 2, -3]))

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(window.devicePixelRatio)

  const camera = new PerspectiveCamera(38, 1, 0.05, 100)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  frameCamera(camera, controls, geometry)

  const positions = geometry.getAttribute('position').array as Float32Array
  const uvs = geometry.getAttribute('uv').array as Float32Array
  const index = buildUvIndex(uvs, geometry.getIndex()?.array as Uint32Array)

  const raycaster = new Raycaster()
  const pointer = new Vector2()
  let texture: CanvasTexture | null = null

  function render() {
    controls.update()
    renderer.render(scene, camera)
  }

  return {
    render,
    resize(width, height) {
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    },
    pick(x, y) {
      pointer.set(x * 2 - 1, 1 - y * 2)
      raycaster.setFromCamera(pointer, camera)
      const [hit] = raycaster.intersectObject(car)
      // Shown only once the hit has everything the caller needs: a mesh without
      // UVs would otherwise leave the marker standing wherever it last landed,
      // pointing at a panel the cursor is no longer over.
      if (!hit?.uv || hit.faceIndex === undefined || hit.faceIndex === null) {
        marker.visible = false
        return null
      }

      marker.visible = true
      marker.position.copy(hit.point)
      return { u: hit.uv.x, v: hit.uv.y, part: partAt(data, hit.faceIndex) }
    },
    showAt(u, v) {
      const found = locate(index, positions, uvs, u, v)
      marker.visible = found !== null
      if (found) marker.position.set(found[0], found[1], found[2])
    },
    maxTextureSize() {
      return renderer.capabilities.maxTextureSize
    },
    setTexture(source) {
      texture?.dispose()
      const next = new CanvasTexture(source)
      next.colorSpace = SRGBColorSpace
      next.flipY = false
      // A flank seen at an angle is what a livery mostly is, and without this
      // the mipmap chosen for it smears a sponsor into a stripe.
      next.anisotropy = renderer.capabilities.getMaxAnisotropy()
      next.needsUpdate = true
      texture = next
      material.map = next
      material.needsUpdate = true
    },
    dispose() {
      marker.geometry.dispose()
      ;(marker.material as MeshBasicMaterial).dispose()
      controls.dispose()
      texture?.dispose()
      material.dispose()
      geometry.dispose()
      renderer.dispose()
    },
  }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// Big enough to spot on a GT car, small enough not to swallow a mirror casing.
function markerRadius(geometry: BufferGeometry) {
  return (geometry.boundingSphere?.radius ?? 3) * 0.012
}

function partAt(data: CarMeshData, faceIndex: number) {
  const part = data.parts.find(
    (range) => faceIndex >= range.start && faceIndex < range.start + range.count,
  )
  return part?.name ?? 'unknown part'
}
