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
