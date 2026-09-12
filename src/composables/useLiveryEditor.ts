import { computed, ref, shallowRef } from 'vue'
import { useLiveryPersistence } from '@/composables/useLiveryPersistence'
import { loadReplacementFull } from '@/lib/tauri'
import { loadTextureImage } from '@/lib/textureImage'
import type { LiveryDocument, Texture } from '@/types/index'

const texture = shallowRef<Texture | null>(null)
const baseDataUrl = ref<string | null>(null)
const restoredDocument = shallowRef<LiveryDocument | null>(null)

/// The editor paints onto one texture at a time, opened from its detail view and
/// closed back to it, so a single module-level slot is the whole navigation model.
export function useLiveryEditor() {
  const { restore } = useLiveryPersistence()
  const isOpen = computed(() => texture.value !== null)

  function open(target: Texture, base: string, restored: LiveryDocument | null = null) {
    texture.value = target
    baseDataUrl.value = base
    restoredDocument.value = restored
  }

  /// Decodes the texture, then opens it. Every entry point goes through here so a
  /// card, a detail window and a command all land on the same editor state.
  async function openFor(target: Texture, modPath: string) {
    const restored = await restore(target)
    open(target, await baseFor(target, modPath, restored !== undefined), restored ?? null)
  }

  /// A stored stack is drawn back over the original texture — the saved PNG already
  /// contains those layers, so reusing it as the base would paint them twice.
  /// Without a stack, an imported replacement is what the author is looking at, and
  /// editing continues from there rather than silently discarding it.
  async function baseFor(target: Texture, modPath: string, hasDocument: boolean) {
    const replacement = target.replacement?.sourcePath
    if (!hasDocument && replacement) return loadReplacementFull(replacement)
    return loadTextureImage(target, modPath)
  }

  function close() {
    texture.value = null
    baseDataUrl.value = null
    restoredDocument.value = null
  }

  return { texture, baseDataUrl, restoredDocument, isOpen, open, openFor, close }
}
