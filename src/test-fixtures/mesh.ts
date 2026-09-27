import type { CarMeshData } from '@/types/index'

/// A car's texture layout as `get_car_mesh` hands it over, from plain numbers.
/// Positions are left at the origin: nothing reading UVs looks at them.
export function meshOf(uvs: number[], indices: number[]): CarMeshData {
  const vertexCount = uvs.length / 2
  return {
    positions: encode(new Float32Array(vertexCount * 3).buffer),
    uvs: encode(new Float32Array(uvs).buffer),
    indices: encode(new Uint32Array(indices).buffer),
    vertexCount,
    triangleCount: indices.length / 3,
    parts: [],
  }
}

/// Two panels a hole apart on the sheet: a quad down the left three eighths and
/// one down the right three eighths, each split into two triangles.
export function twoPanels(): CarMeshData {
  return meshOf(
    [0, 0, 0.375, 0, 0.375, 1, 0, 1, 0.625, 0, 1, 0, 1, 1, 0.625, 1],
    [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7],
  )
}

function encode(buffer: ArrayBufferLike): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}
