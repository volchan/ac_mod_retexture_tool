import { computed, ref, shallowRef } from 'vue'
import { loadTextureImage } from '@/lib/textureImage'
import type { Texture } from '@/types/index'

const texture = shallowRef<Texture | null>(null)
const baseDataUrl = ref<string | null>(null)

/// The editor paints onto one texture at a time, opened from its detail view and
/// closed back to it, so a single module-level slot is the whole navigation model.
export function useLiveryEditor() {
  const isOpen = computed(() => texture.value !== null)

  function open(target: Texture, base: string) {
    texture.value = target
    baseDataUrl.value = base
  }

  /// Decodes the texture, then opens it. Every entry point goes through here so a
  /// card, a detail window and a command all land on the same editor state.
  async function openFor(target: Texture, modPath: string) {
    open(target, await loadTextureImage(target, modPath))
  }

  function close() {
    texture.value = null
    baseDataUrl.value = null
  }

  return { texture, baseDataUrl, isOpen, open, openFor, close }
}
