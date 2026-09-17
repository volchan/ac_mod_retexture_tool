import { ref } from 'vue'
import { listSystemFonts } from '@/lib/tauri'

const FALLBACK = ['Arial', 'Georgia', 'Impact', 'Times New Roman', 'Verdana']

const fonts = ref<string[]>(FALLBACK)
let loaded = false

/// The families installed on this machine. The editor flattens to PNG, so the
/// only machine that has to own the font is the one the livery is drawn on.
export function useSystemFonts() {
  async function load() {
    if (loaded) return
    loaded = true
    try {
      const found = await listSystemFonts()
      if (found.length > 0) fonts.value = found
    } catch {
      // A platform whose font folders cannot be read still gets the safe list.
      loaded = false
    }
  }

  return { fonts, load }
}
