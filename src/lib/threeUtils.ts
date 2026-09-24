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

/// How AC's own previews are shot: from ahead and off to one side, high enough
/// to see along the bonnet and the roof without the car reading as a floor plan.
/// The Y component is the height — 0.26 is about 15 degrees up.
const HERO_VIEW = new Vector3(0.62, 0.26, 0.78).normalize()

/// Air left around the car, as a share of the distance it takes to fit it.
const HERO_MARGIN = 1.06

/// Passes over the car to settle where it sits in the frame. The first aims at
/// the middle of the car, which is not the middle of its picture: the near end
/// of a car is closer to the lens than the far end, so it takes more of the
/// width, and a shape symmetrical in space lands off to one side. Each pass
/// re-aims at the middle of what the last one drew.
const HERO_PASSES = 8

/// How much of the measured error each pass takes out. A whole correction
/// overshoots — the aim moves, so the car's own depth moves with it — and the
/// framing then swings from one side to the other without ever settling.
const HERO_STEP = 0.5

/// Frames the whole car as close as it will go without cropping it, centred on
/// what the lens actually sees.
///
/// Fitted to the panels themselves rather than to any box around them. A car
/// touches its bounding sphere only at the bumpers, and seen from three quarters
/// it touches its bounding box at four corners of empty air — fitting either
/// leaves the picture mostly sky.
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

  const view = viewBasis()
  const frustum = frustumOf(camera)
  const target = box.getCenter(new Vector3())
  let distance = fitDistance(geometry, target, view, frustum)

  for (let pass = 1; pass < HERO_PASSES; pass += 1) {
    const seen = projectedCentre(geometry, target, view, frustum, distance)
    target
      .addScaledVector(view.right, seen.x * frustum.halfWidth * distance * HERO_STEP)
      .addScaledVector(view.up, seen.y * frustum.halfHeight * distance * HERO_STEP)
    distance = fitDistance(geometry, target, view, frustum)
  }

  camera.position.copy(target).addScaledVector(view.forward, distance * HERO_MARGIN)
  controls.target.copy(target)
  controls.update()
}

export function keyLight(intensity: number, at: [number, number, number]) {
  const light = new DirectionalLight(0xffffff, intensity)
  light.position.set(...at)
  return light
}

/// The camera's own axes for the hero shot, in world space.
function viewBasis() {
  const forward = HERO_VIEW.clone()
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), forward).normalize()
  return { forward, right, up: new Vector3().crossVectors(forward, right).normalize() }
}

function frustumOf(camera: PerspectiveCamera) {
  const halfHeight = Math.tan((camera.fov * Math.PI) / 360)
  return { halfHeight, halfWidth: halfHeight * camera.aspect }
}

type ViewBasis = ReturnType<typeof viewBasis>
type Frustum = ReturnType<typeof frustumOf>

/// How far back the lens has to stand for every vertex to fall inside the frame.
/// Taken per vertex and on both axes: the one that clears last decides.
function fitDistance(
  geometry: BufferGeometry,
  target: Vector3,
  view: ViewBasis,
  frustum: Frustum,
): number {
  const positions = geometry.getAttribute('position')
  const offset = new Vector3()

  let distance = 0
  for (let at = 0; at < positions.count; at += 1) {
    offset.fromBufferAttribute(positions, at).sub(target)
    const depth = offset.dot(view.forward)
    distance = Math.max(
      distance,
      depth + Math.abs(offset.dot(view.right)) / frustum.halfWidth,
      depth + Math.abs(offset.dot(view.up)) / frustum.halfHeight,
    )
  }
  return distance
}

/// A vertex level with the lens divides by nothing. It cannot happen on a car
/// the camera stands outside of, and a zero here would send the aim to infinity.
const MIN_DEPTH = 1e-3

/// Where the middle of the car's silhouette falls in the frame, -1 to 1 on each
/// axis. Zero is dead centre; anything else is how far the aim has to move.
function projectedCentre(
  geometry: BufferGeometry,
  target: Vector3,
  view: ViewBasis,
  frustum: Frustum,
  distance: number,
) {
  const positions = geometry.getAttribute('position')
  const offset = new Vector3()
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }

  for (let at = 0; at < positions.count; at += 1) {
    offset.fromBufferAttribute(positions, at).sub(target)
    // What the lens sees is divided by depth, which is the whole reason the
    // near end of a car takes more of the width than the far end.
    const depth = Math.max(distance - offset.dot(view.forward), MIN_DEPTH)
    const x = offset.dot(view.right) / (depth * frustum.halfWidth)
    const y = offset.dot(view.up) / (depth * frustum.halfHeight)

    bounds.minX = Math.min(bounds.minX, x)
    bounds.maxX = Math.max(bounds.maxX, x)
    bounds.minY = Math.min(bounds.minY, y)
    bounds.maxY = Math.max(bounds.maxY, y)
  }

  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
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
