import { ref } from 'vue'
import { loadModState, saveModState, textureStableKey } from '@/lib/replacementStore'
import {
  cancelDecode,
  decodeModTextures,
  onDecodeProgress,
  onDecodeTexture,
  previewReplacementImage,
} from '@/lib/tauri'
import type { MatchedTexture, Mod, ProgressInfo, Texture, TextureCategory } from '@/types/index'

const textures = ref<Texture[]>([])
const selected = ref<Set<string>>(new Set())
const decodeProgress = ref<ProgressInfo>({ current: 0, total: 0, label: '' })
const isDecoding = ref(false)
const currentModPath = ref<string | undefined>(undefined)
const lastImportFolder = ref<string | undefined>(undefined)

async function persist() {
  if (!currentModPath.value) return
  await saveModState(currentModPath.value, {
    importFolder: lastImportFolder.value,
    replacements: textures.value
      .filter((t) => t.replacement != null)
      .map((t) => ({
        textureKey: textureStableKey(t.name, t.path),
        sourcePath: t.replacement?.sourcePath ?? '',
        sourceWidth: t.replacement?.width ?? 0,
        sourceHeight: t.replacement?.height ?? 0,
      })),
  })
}

export function useTextures() {
  let unlisten: (() => void) | null = null

  function reset() {
    textures.value = []
    selected.value = new Set()
    decodeProgress.value = { current: 0, total: 0, label: '' }
    isDecoding.value = false
    currentModPath.value = undefined
    lastImportFolder.value = undefined
    if (unlisten) {
      unlisten()
      unlisten = null
    }
  }

  async function init(mod: Mod) {
    if (isDecoding.value) {
      await cancelDecode()
    }
    reset()
    currentModPath.value = mod.path
    isDecoding.value = true

    const unlistenTexture = await onDecodeTexture((tex) => {
      textures.value = [...textures.value, tex]
    })

    const unlistenProgress = await onDecodeProgress((info) => {
      decodeProgress.value = info
    })

    unlisten = () => {
      unlistenTexture()
      unlistenProgress()
    }

    try {
      await decodeModTextures(mod.path, mod.modType)
    } finally {
      isDecoding.value = false
    }
  }

  async function restoreReplacements(modPath: string): Promise<void> {
    if (modPath !== currentModPath.value) return
    const state = await loadModState(modPath)
    if (!state || state.replacements.length === 0) return

    if (state.importFolder) lastImportFolder.value = state.importFolder

    const byKey = new Map(textures.value.map((t) => [textureStableKey(t.name, t.path), t]))
    const matched: MatchedTexture[] = (
      await Promise.all(
        state.replacements.map(async ({ textureKey, sourcePath, sourceWidth, sourceHeight }) => {
          const texture = byKey.get(textureKey)
          if (!texture) return null
          try {
            const previewUrl = await previewReplacementImage(sourcePath)
            return {
              texture,
              sourcePath,
              previewUrl,
              sourceWidth,
              sourceHeight,
              hasDimensionMismatch:
                sourceWidth !== texture.width || sourceHeight !== texture.height,
            } satisfies MatchedTexture
          } catch (err) {
            console.warn(`Failed to restore replacement for ${textureKey}:`, sourcePath, err)
            return null
          }
        }),
      )
    ).filter((m): m is MatchedTexture => m !== null)

    if (matched.length > 0 && modPath === currentModPath.value) applyReplacements(matched)
  }

  function setImportFolder(folder: string) {
    lastImportFolder.value = folder
    persist().catch((err) => console.error('Failed to persist import folder:', err))
  }

  function toggleSelect(id: string) {
    const next = new Set(selected.value)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    selected.value = next
  }

  function selectAll() {
    selected.value = new Set(textures.value.map((t) => t.id))
  }

  function deselectAll() {
    selected.value = new Set()
  }

  function filteredTextures(category: TextureCategory): Texture[] {
    if (category === 'all') return textures.value
    return textures.value.filter((t) => t.category === category)
  }

  function applyReplacements(matched: MatchedTexture[]) {
    const byId = new Map(matched.map((m) => [m.texture.id, m]))
    textures.value = textures.value.map((t) => {
      const match = byId.get(t.id)
      if (!match) return t
      return {
        ...t,
        replacement: {
          sourcePath: match.sourcePath,
          previewUrl: match.previewUrl,
          width: match.sourceWidth,
          height: match.sourceHeight,
        },
      }
    })
    persist().catch((err) => console.error('Failed to persist replacements:', err))
  }

  function revertReplacement(id: string) {
    textures.value = textures.value.map((t) => (t.id === id ? { ...t, replacement: undefined } : t))
    persist().catch((err) => console.error('Failed to persist revert:', err))
  }

  function revertAll() {
    textures.value = textures.value.map((t) => ({ ...t, replacement: undefined }))
    persist().catch((err) => console.error('Failed to persist revert all:', err))
  }

  async function cleanup() {
    if (isDecoding.value) {
      await cancelDecode()
    }
    reset()
  }

  return {
    textures,
    selected,
    decodeProgress,
    isDecoding,
    lastImportFolder,
    init,
    restoreReplacements,
    setImportFolder,
    toggleSelect,
    selectAll,
    deselectAll,
    filteredTextures,
    applyReplacements,
    revertReplacement,
    revertAll,
    cleanup,
  }
}
