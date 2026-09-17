import { ref, shallowRef } from 'vue'
import { getLiveryModel } from '@/lib/tauri'
import type { LiveryModel, Texture } from '@/types/index'

/// Big enough to read a sponsor decal on screen, small enough that forty of them
/// cross the IPC boundary in seconds rather than minutes.
const MAX_TEXTURE = 1024

const isOpen = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)
const model = shallowRef<LiveryModel | null>(null)

// Reading a car walks the whole model and decodes every texture it names: a reply
// arriving after the dialog closed, or after another skin opened, is dropped.
let generation = 0

/// The car as the game would dress it, for the dialog to draw.
export function useLiveryPreview() {
  async function open(carPath: string, skin: string, textures: Texture[]) {
    const request = ++generation
    isOpen.value = true
    isLoading.value = true
    error.value = null
    model.value = null

    try {
      const loaded = await getLiveryModel(carPath, skin, MAX_TEXTURE, queuedOverrides(textures))
      if (request !== generation) return
      model.value = loaded
    } catch (e) {
      if (request !== generation) return
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (request === generation) isLoading.value = false
    }
  }

  function close() {
    generation += 1
    isOpen.value = false
    isLoading.value = false
    model.value = null
    error.value = null
  }

  return { isOpen, isLoading, error, model, open, close }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

function queuedOverrides(textures: Texture[]): [string, string][] {
  return textures
    .filter((texture) => texture.replacement !== undefined)
    .map((texture) => [texture.name, texture.replacement?.sourcePath ?? ''])
}
