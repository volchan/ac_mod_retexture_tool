import type Konva from 'konva'
import { ref } from 'vue'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import { useTextures } from '@/composables/useTextures'
import { textureStableKey } from '@/lib/replacementStore'
import { flattenStage, thumbnailRatio } from '@/lib/stageExport'
import { loadLiveryDocument, saveLiveryEdit } from '@/lib/tauri'
import type { LiveryDocument, Texture } from '@/types/index'

const isSaving = ref(false)

/// Bridges the editor to the rest of the app: an edit leaves as a PNG replacement,
/// exactly like one imported from a folder, so export and repack need no changes.
export function useLiveryPersistence() {
  const { document } = useLiveryDocument()
  const { applyReplacements } = useTextures()

  async function restore(texture: Texture): Promise<LiveryDocument | undefined> {
    const stored = await loadLiveryDocument(textureStableKey(texture.name, texture.path))
    return parseDocument(stored, texture)
  }

  async function save(stage: Konva.Stage, texture: Texture) {
    isSaving.value = true
    try {
      const { width, height } = texture
      const full = flattenStage(stage, width, height)
      const thumbnail = flattenStage(stage, width, height, thumbnailRatio(width))

      const sourcePath = await saveLiveryEdit({
        textureKey: textureStableKey(texture.name, texture.path),
        pngBase64: full,
        documentJson: JSON.stringify(document.value),
      })

      applyReplacements([
        {
          texture,
          sourcePath,
          previewUrl: thumbnail,
          sourceWidth: width,
          sourceHeight: height,
          hasDimensionMismatch: false,
        },
      ])
      return sourcePath
    } finally {
      isSaving.value = false
    }
  }

  return { isSaving, restore, save }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// A stored stack only applies to a texture of the same size: the same skin
/// re-exported at another resolution would place every sticker wrong.
function parseDocument(stored: string | null, texture: Texture): LiveryDocument | undefined {
  if (!stored) return undefined
  try {
    const parsed = JSON.parse(stored) as LiveryDocument
    if (parsed.width !== texture.width || parsed.height !== texture.height) return undefined
    if (!Array.isArray(parsed.layers)) return undefined
    return { ...parsed, textureId: texture.id }
  } catch {
    return undefined
  }
}
