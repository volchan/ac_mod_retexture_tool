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
      marker.visible = hit !== undefined
      if (!hit?.uv || hit.faceIndex === undefined || hit.faceIndex === null) return null

      marker.position.copy(hit.point)
      return { u: hit.uv.x, v: hit.uv.y, part: partAt(data, hit.faceIndex) }
    },
    showAt(u, v) {
      const found = locate(index, positions, uvs, u, v)
      marker.visible = found !== null
      if (found) marker.position.set(found[0], found[1], found[2])
    },
    setTexture(source) {
      texture?.dispose()
      const next = new CanvasTexture(source)
      next.colorSpace = SRGBColorSpace
      next.flipY = false
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

/// Triangles bucketed by the UV cell they touch, so finding the panel under a
/// point of the texture tests a handful of them instead of half a million.
const UV_CELLS = 128

type UvIndex = { cells: Map<number, number[]>; triangles: Uint32Array }

function buildUvIndex(uvs: Float32Array, triangles: Uint32Array): UvIndex {
  const cells = new Map<number, number[]>()

  for (let face = 0; face < triangles.length / 3; face += 1) {
    const corners = [triangles[face * 3], triangles[face * 3 + 1], triangles[face * 3 + 2]]
    let minU = 1
    let maxU = 0
    let minV = 1
    let maxV = 0
    for (const corner of corners) {
      minU = Math.min(minU, uvs[corner * 2])
      maxU = Math.max(maxU, uvs[corner * 2])
      minV = Math.min(minV, uvs[corner * 2 + 1])
      maxV = Math.max(maxV, uvs[corner * 2 + 1])
    }
    for (const key of cellRange(minU, maxU, minV, maxV)) {
      const bucket = cells.get(key)
      if (bucket) bucket.push(face)
      else cells.set(key, [face])
    }
  }

  return { cells, triangles }
}

function cellRange(minU: number, maxU: number, minV: number, maxV: number): number[] {
  const keys: number[] = []
  const clamp = (value: number) => Math.min(UV_CELLS - 1, Math.max(0, Math.floor(value * UV_CELLS)))
  for (let cu = clamp(minU); cu <= clamp(maxU); cu += 1) {
    for (let cv = clamp(minV); cv <= clamp(maxV); cv += 1) keys.push(cv * UV_CELLS + cu)
  }
  return keys
}

/// The point of the car wearing texture coordinate `(u, v)`, found by locating
/// the triangle that covers it and reading its corners in the same proportions.
function locate(
  index: UvIndex,
  positions: Float32Array,
  uvs: Float32Array,
  u: number,
  v: number,
): [number, number, number] | null {
  const cell = Math.floor(v * UV_CELLS) * UV_CELLS + Math.floor(u * UV_CELLS)
  for (const face of index.cells.get(cell) ?? []) {
    const [a, b, c] = [
      index.triangles[face * 3],
      index.triangles[face * 3 + 1],
      index.triangles[face * 3 + 2],
    ]
    const weights = barycentric(uvs, a, b, c, u, v)
    if (!weights) continue
    return [0, 1, 2].map(
      (axis) =>
        positions[a * 3 + axis] * weights[0] +
        positions[b * 3 + axis] * weights[1] +
        positions[c * 3 + axis] * weights[2],
    ) as [number, number, number]
  }
  return null
}

function barycentric(
  uvs: Float32Array,
  a: number,
  b: number,
  c: number,
  u: number,
  v: number,
): [number, number, number] | null {
  const [ax, ay] = [uvs[a * 2], uvs[a * 2 + 1]]
  const [bx, by] = [uvs[b * 2], uvs[b * 2 + 1]]
  const [cx, cy] = [uvs[c * 2], uvs[c * 2 + 1]]

  const area = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
  if (area === 0) return null

  const first = ((by - cy) * (u - cx) + (cx - bx) * (v - cy)) / area
  const second = ((cy - ay) * (u - cx) + (ax - cx) * (v - cy)) / area
  const third = 1 - first - second
  if (first < 0 || second < 0 || third < 0) return null
  return [first, second, third]
}

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
