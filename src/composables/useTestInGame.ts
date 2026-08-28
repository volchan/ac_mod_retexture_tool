import { load } from '@tauri-apps/plugin-store'
import { ref } from 'vue'
import { listAcCars, listTrackLayouts, testInGame } from '@/lib/tauri'
import type { AcInstall, LibraryEntry, TextureReplacementOpt } from '@/types/index'

const STORE_KEY = 'ac-install'

export function useTestInGame() {
  const dialogOpen = ref(false)
  const isTesting = ref(false)
  const isLoadingCars = ref(false)
  const cars = ref<LibraryEntry[]>([])
  const selectedCarId = ref<string | null>(null)
  const layouts = ref<string[]>([])
  const selectedLayout = ref<string | null>(null)

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
    layouts.value = []
    selectedLayout.value = null
    cars.value = []
    dialogOpen.value = true
    isLoadingCars.value = true

    try {
      const [fetchedCars, fetchedLayouts] = await Promise.all([
        listAcCars(install.path),
        listTrackLayouts(modPath),
      ])
      cars.value = fetchedCars
      layouts.value = fetchedLayouts
      selectedLayout.value = fetchedLayouts.length === 1 ? fetchedLayouts[0] : null
    } catch {
      // ignore — cars/layouts stay empty, user can retry by reopening
    } finally {
      isLoadingCars.value = false
    }
  }

  async function launch(replacements: TextureReplacementOpt[]): Promise<void> {
    if (!pendingAcPath || !pendingModPath || !selectedCarId.value) return
    if (layouts.value.length > 0 && !selectedLayout.value) return
    const acPath = pendingAcPath
    const modPath = pendingModPath
    const carId = selectedCarId.value
    const configTrack = selectedLayout.value ?? ''

    dialogOpen.value = false
    isTesting.value = true

    try {
      await testInGame(acPath, modPath, carId, configTrack, replacements)
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

  function selectLayout(name: string | null): void {
    selectedLayout.value = name
  }

  return {
    dialogOpen,
    isTesting,
    isLoadingCars,
    cars,
    acPath,
    selectedCarId,
    layouts,
    selectedLayout,
    openDialog,
    launch,
    closeDialog,
    selectCar,
    selectLayout,
  }
}
