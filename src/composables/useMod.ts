import { ref } from 'vue'
import { scanModFolder } from '@/lib/tauri'
import type { Mod } from '@/types/index'

const mod = ref<Mod | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

export function useMod() {
  async function loadMod(path: string) {
    isLoading.value = true
    error.value = null
    try {
      mod.value = await scanModFolder(path)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      isLoading.value = false
    }
  }

  function closeMod() {
    mod.value = null
    error.value = null
  }

  return { mod, isLoading, error, loadMod, closeMod }
}
