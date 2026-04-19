import { ref } from 'vue'
import { scanModFolder } from '@/lib/tauri'
import type { Mod } from '@/types/index'

const mod = ref<Mod | null>(null)
const isLoading = ref(false)

export function useMod() {
  async function loadMod(path: string): Promise<{ error: string } | null> {
    isLoading.value = true
    try {
      mod.value = await scanModFolder(path)
      isLoading.value = false
      return null
    } catch (e) {
      isLoading.value = false
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  function closeMod() {
    mod.value = null
  }

  return { mod, isLoading, loadMod, closeMod }
}
