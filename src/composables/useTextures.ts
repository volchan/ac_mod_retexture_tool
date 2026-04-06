import { ref } from 'vue'
import { decodeModTextures, onDecodeProgress } from '@/lib/tauri'
import type { Mod, ProgressInfo, Texture, TextureCategory } from '@/types/index'

const textures = ref<Texture[]>([])
const selected = ref<Set<string>>(new Set())
const decodeProgress = ref<ProgressInfo>({ current: 0, total: 0, label: '' })
const isDecoding = ref(false)

export function useTextures() {
  let unlisten: (() => void) | null = null

  async function init(mod: Mod) {
    isDecoding.value = true
    decodeProgress.value = { current: 0, total: 0, label: '' }
    textures.value = []
    selected.value = new Set()

    unlisten = await onDecodeProgress((info) => {
      decodeProgress.value = info
    })

    try {
      textures.value = await decodeModTextures(mod.path, mod.type)
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

  function cleanup() {
    if (unlisten) {
      unlisten()
      unlisten = null
    }
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
    cleanup,
  }
}
