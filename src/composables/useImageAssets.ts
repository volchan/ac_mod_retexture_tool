import { ref } from 'vue'
import { loadReplacementFull } from '@/lib/tauri'

const cache = ref<Record<string, HTMLImageElement>>({})
const pending = new Map<string, Promise<HTMLImageElement | null>>()

/// Image layers store a path, not pixels, so the document stays small enough to
/// clone for every undo entry. Decoded bitmaps live here instead, shared by path.
export function useImageAssets() {
  /// Synchronous for rendering: returns null and starts loading on a cache miss,
  /// then the cache update re-renders the canvas with the bitmap in place.
  function resolve(src: string): HTMLImageElement | null {
    const cached = cache.value[src]
    if (cached) return cached
    void load(src)
    return null
  }

  function load(src: string): Promise<HTMLImageElement | null> {
    const cached = cache.value[src]
    if (cached) return Promise.resolve(cached)

    const inFlight = pending.get(src)
    if (inFlight) return inFlight

    const task = decode(src).then((img) => {
      if (img) cache.value = { ...cache.value, [src]: img }
      pending.delete(src)
      return img
    })
    pending.set(src, task)
    return task
  }

  return { resolve, load }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// The webview cannot read a file path directly — the asset protocol is off — so
/// the backend hands back a data URL, the same way every other image in the app
/// reaches the frontend.
async function decode(src: string): Promise<HTMLImageElement | null> {
  try {
    const dataUrl = src.startsWith('data:') ? src : await loadReplacementFull(src)
    return await toImage(dataUrl)
  } catch {
    return null
  }
}

function toImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}
