import { load } from '@tauri-apps/plugin-store'
import { ref } from 'vue'
import { listAcCars, testInGame } from '@/lib/tauri'
import type { AcInstall, LibraryEntry, TextureReplacementOpt } from '@/types/index'

const STORE_KEY = 'ac-install'

export function useTestInGame() {
  const dialogOpen = ref(false)
  const isTesting = ref(false)
  const isLoadingCars = ref(false)
  const cars = ref<LibraryEntry[]>([])
  const selectedCarId = ref<string | null>(null)

  const acPath = ref<string | null>(null)
  let pendingAcPath: string | null = null
  let pendingModPath: string | null = null

  async function openDialog(modPath: string): Promise<void> {
    const store = await load('settings.json')
    const install = await store.get<AcInstall>(STORE_KEY)
    if (!install?.path) return

    pendingAcPath = install.path
    acPath.value = install.path
    pendingModPath = modPath
    selectedCarId.value = null
    cars.value = []
    dialogOpen.value = true
    isLoadingCars.value = true

    try {
      cars.value = await listAcCars(install.path)
    } catch {
      // ignore — cars stays empty, user can retry by reopening
    } finally {
      isLoadingCars.value = false
    }
  }

  async function launch(replacements: TextureReplacementOpt[]): Promise<void> {
    if (!pendingAcPath || !pendingModPath || !selectedCarId.value) return
    const acPath = pendingAcPath
    const modPath = pendingModPath
    const carId = selectedCarId.value

    dialogOpen.value = false
    isTesting.value = true

    try {
      await testInGame(acPath, modPath, carId, replacements)
    } finally {
      isTesting.value = false
    }
  }

  function closeDialog(): void {
    dialogOpen.value = false
  }

  function selectCar(id: string | null): void {
    selectedCarId.value = id
  }

  return {
    dialogOpen,
    isTesting,
    isLoadingCars,
    cars,
    acPath,
    selectedCarId,
    openDialog,
    launch,
    closeDialog,
    selectCar,
  }
}
