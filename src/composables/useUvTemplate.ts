import { ref, shallowRef } from 'vue'
import { getUvTemplate } from '@/lib/tauri'
import type { Texture } from '@/types/index'

const isEnabled = ref(false)
const opacity = ref(0.55)
const image = shallowRef<HTMLImageElement | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

// A template belongs to one texture of one car, and rendering it walks the whole
// model: a reply that arrives after the editor moved on must be dropped.
let generation = 0

/// Overlays the car's UV island outlines on the texture being painted, so panel
/// seams are visible without opening the model in a 3D tool.
export function useUvTemplate() {
  async function toggle(texture: Texture | null, carPath: string | null) {
    isEnabled.value = !isEnabled.value
    if (!isEnabled.value || image.value || !texture || !carPath) return
    await load(texture, carPath)
  }

  function reset() {
    generation += 1
    isEnabled.value = false
    isLoading.value = false
    image.value = null
    error.value = null
  }

  return { isEnabled, opacity, image, isLoading, error, toggle, reset }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

async function load(texture: Texture, carPath: string) {
  const request = ++generation
  isLoading.value = true
  error.value = null
  try {
    const dataUrl = await getUvTemplate(carPath, texture.name, texture.width, texture.height)
    const decoded = await decodeImage(dataUrl)
    if (request !== generation) return
    image.value = decoded
  } catch (e) {
    if (request !== generation) return
    error.value = e instanceof Error ? e.message : String(e)
    isEnabled.value = false
  } finally {
    if (request === generation) isLoading.value = false
  }
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('could not decode the UV template'))
    img.src = src
  })
}
