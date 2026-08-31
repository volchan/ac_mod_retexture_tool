import { ref } from 'vue'
import { listCarSkins } from '@/lib/tauri'
import type { SkinEntry } from '@/types/index'

const isOpen = ref(false)
const isLoading = ref(false)
const carPath = ref('')
const carName = ref('')
const skins = ref<SkinEntry[]>([])
const error = ref('')

export function useSkinPicker() {
  async function openForCar(path: string, name: string): Promise<void> {
    carPath.value = path
    carName.value = name
    skins.value = []
    error.value = ''
    isOpen.value = true
    isLoading.value = true

    try {
      skins.value = await listCarSkins(path)
      if (skins.value.length === 0) {
        error.value = 'This car has no skins folder.'
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      isLoading.value = false
    }
  }

  function close(): void {
    isOpen.value = false
  }

  return { isOpen, isLoading, carPath, carName, skins, error, openForCar, close }
}
