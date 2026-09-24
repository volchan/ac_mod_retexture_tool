import { BufferAttribute, BufferGeometry, PerspectiveCamera, Vector3 } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { describe, expect, it } from 'vitest'
import { frameCamera, frameHero, keyLight } from './threeUtils'

/// A car-shaped box: long, wide, and barely off the ground. Its framing sphere
/// is set by the length, which is the whole reason a sphere fit leaves the sky
/// above it in the picture.
function car(): BufferGeometry {
  const corners = new Float32Array([
    -2.2, 0, -0.9, 2.2, 0, -0.9, -2.2, 1.2, -0.9, 2.2, 1.2, -0.9, -2.2, 0, 0.9, 2.2, 0, 0.9, -2.2,
    1.2, 0.9, 2.2, 1.2, 0.9,
  ])
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(corners, 3))
  geometry.computeBoundingSphere()
  return geometry
}

function stubControls() {
  return { target: new Vector3(), update: () => {} } as unknown as OrbitControls
}

function framed(place: typeof frameCamera) {
  const camera = new PerspectiveCamera(38, 16 / 9, 0.05, 100)
  const geometry = car()
  place(camera, stubControls(), geometry)

  const centre = geometry.boundingSphere?.center ?? new Vector3()
  const offset = camera.position.clone().sub(centre)
  return {
    distance: offset.length(),
    /// How far above the car the camera sits, in degrees.
    pitch: (Math.asin(offset.y / offset.length()) * 180) / Math.PI,
  }
}

/// Where a point lands in the picture: -1 to 1 on both axes, anything outside
/// is off the edge of the frame.
function onScreen(camera: PerspectiveCamera, point: Vector3) {
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  const projected = point.clone().project(camera)
  return Math.max(Math.abs(projected.x), Math.abs(projected.y))
}

describe('frameHero', () => {
  /// The wing, the splitter and the outer wheel are what stick out furthest,
  /// and a framing that guesses its distance is a framing that cuts them off.
  it('leaves the whole car inside the frame', () => {
    const camera = new PerspectiveCamera(38, 1024 / 575, 0.05, 100)
    const geometry = car()

    frameHero(camera, stubControls(), geometry)
    camera.lookAt(geometry.boundingBox?.getCenter(new Vector3()) ?? new Vector3())

    const positions = geometry.getAttribute('position')
    for (let at = 0; at < positions.count; at += 1) {
      const corner = new Vector3().fromBufferAttribute(positions, at)
      expect(onScreen(camera, corner)).toBeLessThanOrEqual(1)
    }
  })

  /// A tall frame has to stand further back than a wide one to fit the same
  /// long car, and a fixed distance crops one of the two.
  it('stands further back for a narrower frame', () => {
    const wide = new PerspectiveCamera(38, 16 / 9, 0.05, 100)
    const narrow = new PerspectiveCamera(38, 1, 0.05, 100)

    frameHero(wide, stubControls(), car())
    frameHero(narrow, stubControls(), car())

    expect(narrow.position.length()).toBeGreaterThan(wide.position.length())
  })

  /// The orbit default fits the whole sphere, and a car touches its own sphere
  /// only at the bumpers: the rest of the frame is the air around it.
  it('stands closer than the orbit default', () => {
    expect(framed(frameHero).distance).toBeLessThan(framed(frameCamera).distance)
  })

  /// A livery is on the flanks. Shot from above it reads as a roof.
  it('shoots from near the roof line rather than from above', () => {
    const { pitch } = framed(frameHero)

    expect(pitch).toBeGreaterThan(0)
    expect(pitch).toBeLessThan(18)
    expect(pitch).toBeLessThan(framed(frameCamera).pitch)
  })

  it('looks at the car', () => {
    const camera = new PerspectiveCamera(38, 16 / 9, 0.05, 100)
    const controls = stubControls()
    const geometry = car()

    frameHero(camera, controls, geometry)

    expect(controls.target).toEqual(geometry.boundingSphere?.center)
  })

  /// An empty geometry has no box to fit, and the camera must still end up
  /// somewhere other than inside the car.
  it('still stands back from a geometry with nothing in it', () => {
    const camera = new PerspectiveCamera(38, 16 / 9, 0.05, 100)

    frameHero(camera, stubControls(), new BufferGeometry())

    expect(camera.position.length()).toBeGreaterThan(1)
  })
})

describe('keyLight', () => {
  it('stands where it is put', () => {
    const light = keyLight(1.2, [3, 5, 4])

    expect(light.intensity).toBe(1.2)
    expect(light.position.toArray()).toEqual([3, 5, 4])
  })
})
