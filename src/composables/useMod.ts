import { ref } from 'vue'
import { clearKn5Cache, scanModFolder } from '@/lib/tauri'
import type { Mod, SkinEntry } from '@/types/index'

const mod = ref<Mod | null>(null)
const activeSkin = ref<SkinEntry | null>(null)
const isLoading = ref(false)

export function useMod() {
  /** `skin` scopes the workspace to a single car skin; tracks pass nothing. */
  async function loadMod(path: string, skin?: SkinEntry): Promise<{ error: string } | null> {
    isLoading.value = true
    clearKn5Cache().catch(() => {})
    try {
      mod.value = await scanModFolder(path)
      activeSkin.value = skin ?? null
      isLoading.value = false
      return null
    } catch (e) {
      isLoading.value = false
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  function closeMod() {
    mod.value = null
    activeSkin.value = null
    clearKn5Cache().catch(() => {})
  }

  return { mod, activeSkin, isLoading, loadMod, closeMod }
}
