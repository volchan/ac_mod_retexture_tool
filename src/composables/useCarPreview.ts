import { ref, shallowRef } from 'vue'
import { getCarMesh } from '@/lib/tauri'
import type { CarMeshData, Texture } from '@/types/index'

const isEnabled = ref(false)
const mesh = shallowRef<CarMeshData | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

// Geometry belongs to one texture of one car, and reading it walks the whole
// model: a reply arriving after the editor moved on must be dropped.
let generation = 0

/// Holds the car geometry the 3D preview draws, next to the flat texture the
/// editor paints on.
export function useCarPreview() {
  async function toggle(texture: Texture | null, carPath: string | null) {
    isEnabled.value = !isEnabled.value
    if (!isEnabled.value || mesh.value || !texture || !carPath) return
    await load(texture, carPath)
  }

  function reset() {
    generation += 1
    isEnabled.value = false
    isLoading.value = false
    mesh.value = null
    error.value = null
  }

  return { isEnabled, mesh, isLoading, error, toggle, reset }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

async function load(texture: Texture, carPath: string) {
  const request = ++generation
  isLoading.value = true
  error.value = null
  try {
    const loaded = await getCarMesh(carPath, texture.name)
    if (request !== generation) return
    mesh.value = loaded
  } catch (e) {
    if (request !== generation) return
    error.value = e instanceof Error ? e.message : String(e)
    isEnabled.value = false
  } finally {
    if (request === generation) isLoading.value = false
  }
}
