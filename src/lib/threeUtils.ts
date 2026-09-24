import {
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  type PerspectiveCamera,
  Vector3,
} from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CarMeshData } from '@/types/index'

export function buildGeometry(data: CarMeshData): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(decodeFloats(data.positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(decodeFloats(data.uvs), 2))
  geometry.setIndex(new BufferAttribute(decodeIndices(data.indices), 1))
  // KN5 ships no usable normals for a merged panel set, and flat shading on raw
  // triangles reads as faceted metal; computed ones follow the real surface.
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

/// Pulls the camera back far enough for the whole panel set to fit, whatever the
/// car: a formula car and a GT car differ by more than a fixed distance allows.
export function frameCamera(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  geometry: BufferGeometry,
) {
  const sphere = geometry.boundingSphere
  const centre = sphere ? sphere.center : new Vector3()
  const radius = sphere?.radius ?? 3

  const distance = radius / Math.sin((camera.fov * Math.PI) / 360)
  camera.position.set(centre.x + distance * 0.6, centre.y + distance * 0.45, centre.z + distance)
  controls.target.copy(centre)
  controls.update()
}

/// How AC's own previews are shot: from ahead and off to one side, barely above
/// the roof. The orbit default looks down from 24 degrees, where a livery reads
/// as a roof.
const HERO_VIEW = new Vector3(0.62, 0.2, 0.78).normalize()

/// Air left around the car, as a share of the distance it takes to fit it.
const HERO_MARGIN = 1.06

/// Frames the whole car as close as it will go without cropping it.
///
/// Fitted to the panels themselves rather than to any box around them. A car
/// touches its bounding sphere only at the bumpers, and seen from three
/// quarters it touches its bounding box at four corners of empty air — fitting
/// either leaves the picture mostly sky. Walking the vertices costs one pass
/// over a buffer that is already in memory and crops nothing.
///
/// The camera's aspect has to be the one being captured before this is called:
/// a wide frame fits a long car at a distance a square one would crop it at.
export function frameHero(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  geometry: BufferGeometry,
) {
  geometry.computeBoundingBox()
  // A car with no geometry has no box to fit — nothing to crop either, so the
  // orbit default is as good an answer as there is.
  const box = geometry.boundingBox
  if (!box || box.isEmpty()) {
    frameCamera(camera, controls, geometry)
    return
  }

  const centre = box.getCenter(new Vector3())
  const forward = HERO_VIEW.clone()
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), forward).normalize()
  const up = new Vector3().crossVectors(forward, right).normalize()

  const halfHeight = Math.tan((camera.fov * Math.PI) / 360)
  const halfWidth = halfHeight * camera.aspect

  // Depth at which the corner still sits inside the frustum, taken for every
  // corner and on both axes: the furthest one is what the camera has to clear.
  const positions = geometry.getAttribute('position')
  const offset = new Vector3()

  let distance = 0
  for (let at = 0; at < positions.count; at += 1) {
    offset.fromBufferAttribute(positions, at).sub(centre)
    const depth = offset.dot(forward)
    distance = Math.max(
      distance,
      depth + Math.abs(offset.dot(right)) / halfWidth,
      depth + Math.abs(offset.dot(up)) / halfHeight,
    )
  }

  camera.position.copy(centre).addScaledVector(forward, distance * HERO_MARGIN)
  controls.target.copy(centre)
  controls.update()
}

export function keyLight(intensity: number, at: [number, number, number]) {
  const light = new DirectionalLight(0xffffff, intensity)
  light.position.set(...at)
  return light
}

function decodeFloats(base64: string): Float32Array {
  return new Float32Array(decodeBytes(base64).buffer)
}

function decodeIndices(base64: string): Uint32Array {
  return new Uint32Array(decodeBytes(base64).buffer)
}

function decodeBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
