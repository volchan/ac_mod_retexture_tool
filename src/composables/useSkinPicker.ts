import { ref } from 'vue'
import { listCarSkins } from '@/lib/tauri'
import type { SkinEntry } from '@/types/index'

const isOpen = ref(false)
const isLoading = ref(false)
const carPath = ref('')
const carName = ref('')
const skins = ref<SkinEntry[]>([])
const error = ref('')

/// Bumped on every open. A listing that comes back after the user moved to another
/// car belongs to a request nobody is waiting for any more, and applying it would
/// offer the previous car's skins under the new car's name.
let generation = 0

export function useSkinPicker() {
  async function openForCar(path: string, name: string): Promise<void> {
    generation += 1
    const request = generation

    carPath.value = path
    carName.value = name
    skins.value = []
    error.value = ''
    isOpen.value = true
    isLoading.value = true

    try {
      const listed = await listCarSkins(path)
      if (request !== generation) return
      skins.value = listed
      if (listed.length === 0) {
        error.value = 'This car has no skins folder.'
      }
    } catch (e) {
      if (request !== generation) return
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (request === generation) isLoading.value = false
    }
  }

  function close(): void {
    isOpen.value = false
  }

  return { isOpen, isLoading, carPath, carName, skins, error, openForCar, close }
}
