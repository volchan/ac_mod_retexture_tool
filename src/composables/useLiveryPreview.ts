import { ref, shallowRef } from 'vue'
import { queuedOverrides } from '@/composables/useSkinPreviewShot'
import { getLiveryModel } from '@/lib/tauri'
import type { LiveryModel, Texture } from '@/types/index'

/// The ceiling is video memory now that the bytes no longer cross the IPC
/// boundary: a 2048 texture costs 16 MB decoded, and a GT names a few dozen.
const MAX_TEXTURE = 2048

const isOpen = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)
const model = shallowRef<LiveryModel | null>(null)
/// Which skin is on screen, so a capture of it knows where to be written back.
const shown = ref<{ carPath: string; skin: string } | null>(null)

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
    shown.value = { carPath, skin }

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
    shown.value = null
  }

  return { isOpen, isLoading, error, model, shown, open, close }
}
