import { decodeFloats, decodeIndices } from '@/lib/threeUtils'
import { buildUvIndex, faceAt, type UvIndex } from '@/lib/uvIndex'
import type { CarMeshData } from '@/types/index'

/// The car's triangles laid out on its texture, grouped into the islands a
/// painter sees as panels.
export interface UvGeometry {
  uvs: Float32Array
  triangles: Uint32Array
  index: UvIndex
  /// Island of each triangle.
  islands: Int32Array
}

/// The pixels one island covers, a byte each, cropped to its box.
export interface IslandMask {
  inside: Uint8Array
  x: number
  y: number
  width: number
  height: number
}

/// How far a mask reaches past the triangles. The texture's own edge pixels are
/// half inside a panel and get sampled by it, and a mipmap reaches further
/// still: stopping at the exact edge leaves the old colour as an outline.
const EDGE_BLEED = 2

export function uvGeometryOf(mesh: CarMeshData): UvGeometry {
  const uvs = decodeFloats(mesh.uvs)
  const triangles = decodeIndices(mesh.indices)
  return { uvs, triangles, index: buildUvIndex(uvs, triangles), islands: islandsOf(uvs, triangles) }
}

/// The island under `(u, v)`, or null over a hole in the atlas.
export function islandAt(geometry: UvGeometry, u: number, v: number): number | null {
  const face = faceAt(geometry.index, geometry.uvs, u, v)
  return face === null ? null : geometry.islands[face]
}

/// Rasterises every triangle of `island` at the sheet's size. Drawn from the
/// model rather than read off the texture: a panel left bare for the car's
/// paint colour is transparent on the sheet, the same as a hole.
export function islandMask(
  geometry: UvGeometry,
  island: number,
  width: number,
  height: number,
): IslandMask {
  const faces = facesOf(geometry, island)
  const box = boxOf(geometry, faces, width, height)
  const inside = new Uint8Array(box.width * box.height)

  for (const face of faces) {
    const corners = pixelCorners(geometry, face, width, height)
    fillTriangle(inside, box, corners)
  }
  bleed(inside, box.width, box.height, EDGE_BLEED)
  return { inside, ...box }
}

/// Triangles sharing an edge at the same UVs belong to one island. Matched on
/// the coordinates rather than the vertex indices: a model splits a vertex
/// wherever its normal creases, which is all over a panel that is flat on paper.
export function islandsOf(uvs: Float32Array, triangles: Uint32Array): Int32Array {
  const faceCount = triangles.length / 3
  const parent = Int32Array.from({ length: faceCount }, (_, face) => face)
  const byEdge = new Map<string, number>()

  for (let face = 0; face < faceCount; face += 1) {
    for (let side = 0; side < 3; side += 1) {
      const key = edgeKey(uvs, triangles[face * 3 + side], triangles[face * 3 + ((side + 1) % 3)])
      const other = byEdge.get(key)
      if (other === undefined) {
        byEdge.set(key, face)
      } else {
        union(parent, face, other)
      }
    }
  }

  return parent.map((_, face) => root(parent, face))
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// Well under a pixel on the largest sheet AC ships, and well over the float
/// noise between two copies of one vertex.
const UV_PRECISION = 1e6

function edgeKey(uvs: Float32Array, a: number, b: number): string {
  const first = pointKey(uvs, a)
  const second = pointKey(uvs, b)
  return first < second ? `${first}|${second}` : `${second}|${first}`
}

function pointKey(uvs: Float32Array, vertex: number): string {
  return `${Math.round(uvs[vertex * 2] * UV_PRECISION)},${Math.round(uvs[vertex * 2 + 1] * UV_PRECISION)}`
}

function root(parent: Int32Array, face: number): number {
  let current = face
  while (parent[current] !== current) {
    parent[current] = parent[parent[current]]
    current = parent[current]
  }
  return current
}

function union(parent: Int32Array, a: number, b: number) {
  parent[root(parent, a)] = root(parent, b)
}

function facesOf(geometry: UvGeometry, island: number): number[] {
  const faces: number[] = []
  geometry.islands.forEach((owner, face) => {
    if (owner === island) {
      faces.push(face)
    }
  })
  return faces
}

type Corners = [number, number, number, number, number, number]

function pixelCorners(geometry: UvGeometry, face: number, width: number, height: number): Corners {
  const corners: number[] = []
  for (let corner = 0; corner < 3; corner += 1) {
    const vertex = geometry.triangles[face * 3 + corner]
    corners.push(geometry.uvs[vertex * 2] * width, geometry.uvs[vertex * 2 + 1] * height)
  }
  return corners as Corners
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/// The island's pixels plus the bleed around them, clipped to the sheet: a
/// tiling UV can run far past its edge.
function boxOf(geometry: UvGeometry, faces: number[], width: number, height: number): Box {
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (const face of faces) {
    const [ax, ay, bx, by, cx, cy] = pixelCorners(geometry, face, width, height)
    minX = Math.min(minX, ax, bx, cx)
    minY = Math.min(minY, ay, by, cy)
    maxX = Math.max(maxX, ax, bx, cx)
    maxY = Math.max(maxY, ay, by, cy)
  }

  const x = Math.max(0, Math.floor(minX) - EDGE_BLEED)
  const y = Math.max(0, Math.floor(minY) - EDGE_BLEED)
  const right = Math.min(width, Math.ceil(maxX) + EDGE_BLEED)
  const bottom = Math.min(height, Math.ceil(maxY) + EDGE_BLEED)
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}

/// Marks every pixel whose centre the triangle covers, whichever way it winds.
function fillTriangle(inside: Uint8Array, box: Box, [ax, ay, bx, by, cx, cy]: Corners) {
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  if (area === 0) {
    return
  }

  const left = Math.max(box.x, Math.floor(Math.min(ax, bx, cx)))
  const top = Math.max(box.y, Math.floor(Math.min(ay, by, cy)))
  const right = Math.min(box.x + box.width - 1, Math.ceil(Math.max(ax, bx, cx)))
  const bottom = Math.min(box.y + box.height - 1, Math.ceil(Math.max(ay, by, cy)))
  const sign = Math.sign(area)

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const px = x + 0.5
      const py = y + 0.5
      const first = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * sign
      const second = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * sign
      const third = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) * sign
      if (first >= 0 && second >= 0 && third >= 0) {
        inside[(y - box.y) * box.width + (x - box.x)] = 1
      }
    }
  }
}

/// Grows the mask by `radius` pixels in every direction, one axis at a time. It
/// also closes the hairlines a sliver triangle leaves by covering no centre.
function bleed(inside: Uint8Array, width: number, height: number, radius: number) {
  const rows = spread(inside, width, height, radius, 1, width)
  const grown = spread(rows, height, width, radius, width, 1)
  inside.set(grown)
}

/// One axis of `bleed`: `step` walks along a line, `stride` from one line to the next.
function spread(
  source: Uint8Array,
  length: number,
  lines: number,
  radius: number,
  step: number,
  stride: number,
): Uint8Array {
  const out = new Uint8Array(source.length)
  for (let line = 0; line < lines; line += 1) {
    let lastSeen = -Infinity
    for (let at = 0; at < length; at += 1) {
      if (source[line * stride + at * step] === 1) {
        lastSeen = at
      }
      if (at - lastSeen <= radius) {
        out[line * stride + at * step] = 1
      }
    }
    let nextSeen = Infinity
    for (let at = length - 1; at >= 0; at -= 1) {
      if (source[line * stride + at * step] === 1) {
        nextSeen = at
      }
      if (nextSeen - at <= radius) {
        out[line * stride + at * step] = 1
      }
    }
  }
  return out
}
