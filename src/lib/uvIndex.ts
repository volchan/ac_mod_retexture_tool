/// Finding which panel of a car wears a given point of its texture: the reverse
/// of what a GPU does, and the answer to "where on the model is this sticker".
///
/// Kept apart from the scene it serves because it is plain arithmetic over two
/// typed arrays — no WebGL context, no canvas, nothing that needs a browser.

/// Triangles bucketed by the UV cell they touch, so finding the panel under a
/// point of the texture tests a handful of them instead of half a million.
export const UV_CELLS = 128

export type UvIndex = { cells: Map<number, number[]>; triangles: Uint32Array }

export function buildUvIndex(uvs: Float32Array, triangles: Uint32Array): UvIndex {
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
  for (let cu = cellOf(minU); cu <= cellOf(maxU); cu += 1) {
    for (let cv = cellOf(minV); cv <= cellOf(maxV); cv += 1) keys.push(cv * UV_CELLS + cu)
  }
  return keys
}

/// Shared by the two sides of the index so a lookup lands in the same cell the
/// build filled. A texture coordinate of exactly 1, or one outside the sheet on
/// a tiling UV, addresses a cell nothing was ever bucketed into.
export function cellOf(value: number): number {
  return Math.min(UV_CELLS - 1, Math.max(0, Math.floor(value * UV_CELLS)))
}

/// The point of the car wearing texture coordinate `(u, v)`, found by locating
/// the triangle that covers it and reading its corners in the same proportions.
export function locate(
  index: UvIndex,
  positions: Float32Array,
  uvs: Float32Array,
  u: number,
  v: number,
): [number, number, number] | null {
  const cell = cellOf(v) * UV_CELLS + cellOf(u)
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

export function barycentric(
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
