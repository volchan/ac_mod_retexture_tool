import { ref } from 'vue'
import { cancelDecode, decodeModTextures, onDecodeProgress, onDecodeTexture } from '@/lib/tauri'
import type { MatchedTexture, Mod, ProgressInfo, Texture, TextureCategory } from '@/types/index'

const textures = ref<Texture[]>([])
const selected = ref<Set<string>>(new Set())
const decodeProgress = ref<ProgressInfo>({ current: 0, total: 0, label: '' })
const isDecoding = ref(false)

export function useTextures() {
  let unlisten: (() => void) | null = null

  function reset() {
    textures.value = []
    selected.value = new Set()
    decodeProgress.value = { current: 0, total: 0, label: '' }
    isDecoding.value = false
    if (unlisten) {
      unlisten()
      unlisten = null
    }
  }

  async function init(mod: Mod) {
    // Cancel any in-progress decode before starting a new one
    if (isDecoding.value) {
      await cancelDecode()
    }
    reset()
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
    init,
    toggleSelect,
    selectAll,
    deselectAll,
    filteredTextures,
    applyReplacements,
    cleanup,
  }
}
