<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import CommandPalette from '@/components/CommandPalette.vue'
import StatusBar from '@/components/layout/StatusBar.vue'
import WorkspaceLayout from '@/components/layout/WorkspaceLayout.vue'
import RepackDialog from '@/components/repack/RepackDialog.vue'
import SkinPickerDialog from '@/components/skin/SkinPickerDialog.vue'
import CarPickerDialog from '@/components/test-in-game/CarPickerDialog.vue'
import TestingOverlay from '@/components/test-in-game/TestingOverlay.vue'
import Toaster from '@/components/ui/sonner/Toaster.vue'
import { useGlobalCommands } from '@/composables/useGlobalCommands'
import { useLibrary } from '@/composables/useLibrary'
import { useMod } from '@/composables/useMod'
import { useSkinMeta } from '@/composables/useSkinMeta'
import { useSkinPicker } from '@/composables/useSkinPicker'
import { useTestInGame } from '@/composables/useTestInGame'
import { useTextureFilter } from '@/composables/useTextureFilter'
import { useTextures } from '@/composables/useTextures'
import { useTheme } from '@/composables/useTheme'
import { exportSkin, showSaveDialog } from '@/lib/tauri'
import type { SkinEntry, TextureReplacementOpt } from '@/types/index'
import LibraryView from '@/views/LibraryView.vue'

const { mod, activeSkin, loadMod, closeMod } = useMod()
const { meta: skinMeta, exportFull } = useSkinMeta()
const {
  isOpen: skinPickerOpen,
  isLoading: isLoadingSkins,
  carPath: skinCarPath,
  carName: skinCarName,
  skins,
  error: skinPickerError,
  openForCar,
  close: closeSkinPicker,
} = useSkinPicker()
const { textures, selected, selectAll, lastImportFolder } = useTextures()
const { init: initLibrary, addRecent, updateTextureCount } = useLibrary()
const { reset: resetFilter } = useTextureFilter()
const { triggerExtract, triggerImport, triggerQueue } = useGlobalCommands()
const { cycleMode } = useTheme()
const {
  dialogOpen: testDialogOpen,
  isTesting,
  isLoadingCars,
  cars,
  acPath,
  selectedCarId,
  layouts,
  selectedLayout,
  openDialog: openTestDialog,
  launch: launchTest,
  closeDialog: closeTestDialog,
  selectCar,
  selectLayout,
} = useTestInGame()

const cmdPaletteOpen = ref(false)
const repackOpen = ref(false)
const repackOutputPath = ref('')
const repackReplacements = ref<TextureReplacementOpt[]>([])

const queueCount = computed(() => textures.value.filter((t) => t.replacement != null).length)
const selectedCount = computed(() => selected.value.size)

onMounted(async () => {
  await initLibrary()
  window.addEventListener('keydown', handleGlobalKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKey)
})

async function handleGlobalKey(e: KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey)) return
  const target = e.target as HTMLElement
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
    return
  const key = e.key.toLowerCase()
  if (key === 'k') {
    e.preventDefault()
    cmdPaletteOpen.value = true
  } else if (key === 'a' && mod.value) {
    e.preventDefault()
    selectAll()
  } else if (key === 'r' && mod.value) {
    e.preventDefault()
    handleRepack()
  } else if (key === 'e' && mod.value) {
    e.preventDefault()
    triggerExtract()
  } else if (key === 'i' && mod.value) {
    e.preventDefault()
    const path = await open({
      directory: true,
      multiple: false,
      defaultPath: lastImportFolder.value,
    })
    if (typeof path === 'string') triggerImport(path)
  }
}

async function handleDrop(path: string) {
  const result = await loadMod(path)
  if (result?.error) {
    toast.error(result.error)
    return
  }
  if (!mod.value) return
  if (mod.value.modType === 'car') {
    closeMod()
    toast.error('Open cars from the library to pick a skin.')
    return
  }
  if (mod.value.modType !== 'track') {
    closeMod()
    toast.error('Unsupported mod type.')
    return
  }
  await addRecent(mod.value)
  resetFilter()
}

watch(
  () => textures.value.length,
  (count) => {
    if (mod.value) updateTextureCount(mod.value.meta.folderName, count)
  },
)

async function handleOpenCar(path: string, name: string) {
  await openForCar(path, name)
}

async function handleSkinSelected(skin: SkinEntry) {
  const carPath = skinCarPath.value
  closeSkinPicker()

  const result = await loadMod(carPath, skin)
  if (result?.error) {
    toast.error(result.error)
    return
  }
  if (!mod.value) return

  await addRecent(mod.value)
  resetFilter()
}

async function handleBrowse() {
  const chosenPath = await open({ directory: true, multiple: false })
  if (typeof chosenPath === 'string') await handleDrop(chosenPath)
}

async function handleOpenRecent(path: string) {
  await handleDrop(path)
}

async function handleRepack() {
  if (!mod.value) return

  const defaultName = `${mod.value.meta.folderName}.zip`
  const outputPath = await showSaveDialog(defaultName)
  if (!outputPath) return

  repackOutputPath.value = outputPath
  repackReplacements.value = textures.value
    .filter((t) => t.replacement != null)
    .map((t) => ({
      textureId: t.id,
      sourcePath: t.replacement?.sourcePath ?? '',
      kn5File: t.source === 'kn5' ? t.path : undefined,
      textureName: t.name,
      skinFolder: t.skinFolder,
      originalFormat: t.format,
      heroImagePath: t.category === 'preview' ? t.path : undefined,
    }))
  repackOpen.value = true
}

async function handleExportSkin() {
  if (!mod.value || !activeSkin.value || !skinMeta.value) return

  const outputPath = await showSaveDialog(`${skinMeta.value.folderName}.zip`)
  if (!outputPath) return

  try {
    await exportSkin({
      carPath: mod.value.path,
      skinFolder: activeSkin.value.name,
      outputPath,
      meta: skinMeta.value,
      full: exportFull.value,
      replacements: textures.value
        .filter((t) => t.replacement != null)
        .map((t) => ({
          textureId: t.id,
          sourcePath: t.replacement?.sourcePath ?? '',
          textureName: t.name,
          skinFolder: t.skinFolder,
          originalFormat: t.format,
        })),
    })
    toast.success(`Exported ${skinMeta.value.folderName}`)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e))
  }
}

async function handleCmdAction(action: string) {
  if (action === 'repack') handleRepack()
  if (action === 'extract') triggerExtract()
  if (action === 'import') {
    const path = await open({
      directory: true,
      multiple: false,
      defaultPath: lastImportFolder.value,
    })
    if (typeof path === 'string') triggerImport(path)
  }
  if (action === 'switch-mod') {
    closeMod()
    resetFilter()
  }
  if (action === 'toggle-theme') cycleMode()
  if (action === 'queue') triggerQueue()
}

async function handleLaunchTest() {
  const replacements = textures.value
    .filter((t) => t.replacement != null)
    .map((t) => ({
      textureId: t.id,
      sourcePath: t.replacement?.sourcePath ?? '',
      // Use full absolute path so strip_prefix works for nested KN5 subdirectories
      kn5File: t.source === 'kn5' ? t.path : undefined,
      textureName: t.name,
      skinFolder: t.skinFolder,
      originalFormat: t.format,
      heroImagePath: t.category === 'preview' ? t.path : undefined,
    }))
  try {
    await launchTest(replacements)
  } catch (e) {
    toast.error(typeof e === 'string' ? e : String(e))
  }
}

defineExpose({
  CommandPalette,
  SkinPickerDialog,
  StatusBar,
  WorkspaceLayout,
  RepackDialog,
  CarPickerDialog,
  TestingOverlay,
  LibraryView,
  Toaster,
  mod,
  loadMod,
  closeMod,
  textures,
  selected,
  lastImportFolder,
  cmdPaletteOpen,
  repackOpen,
  repackOutputPath,
  repackReplacements,
  testDialogOpen,
  isTesting,
  isLoadingCars,
  cars,
  acPath,
  selectedCarId,
  selectCar,
  selectedLayout,
  selectLayout,
  layouts,
  closeTestDialog,
  launchTest,
  openTestDialog,
  queueCount,
  selectedCount,
  updateTextureCount,
  triggerQueue,
  skinPickerOpen,
  isLoadingSkins,
  skinCarName,
  skins,
  skinPickerError,
  closeSkinPicker,
  handleOpenCar,
  handleSkinSelected,
  handleDrop,
  handleBrowse,
  handleOpenRecent,
  handleRepack,
  handleExportSkin,
  handleCmdAction,
  handleLaunchTest,
})
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden">
    <!-- Library (no mod loaded) -->
    <LibraryView
      v-if="!mod"
      class="flex-1 min-h-0"
      @open="handleOpenRecent"
      @open-car="handleOpenCar"
      @browse="handleBrowse"
    />

    <!-- Workspace (mod loaded) -->
    <WorkspaceLayout
      v-else
      class="flex-1 min-h-0"
      :mod="mod"
      :textures="textures"
      @repack="handleRepack"
      @close="handleCmdAction('switch-mod')"
      @open-cmd="cmdPaletteOpen = true"
      @test-in-game="mod && openTestDialog(mod.path)"
      @export-skin="handleExportSkin"
    />

    <!-- Status bar (always visible) -->
    <StatusBar
      :mod-name="mod?.meta.name"
      :texture-count="textures.length"
      :queue-count="queueCount"
    />
  </div>

  <!-- Command palette overlay -->
  <CommandPalette
    v-if="cmdPaletteOpen"
    @close="cmdPaletteOpen = false"
    @repack="handleCmdAction('repack')"
    @extract="handleCmdAction('extract')"
    @import="handleCmdAction('import')"
    @queue="handleCmdAction('queue')"
    @switch-mod="handleCmdAction('switch-mod')"
    @toggle-theme="handleCmdAction('toggle-theme')"
  />

  <!-- Repack dialog -->
  <RepackDialog
    v-if="mod"
    v-model:open="repackOpen"
    :mod="mod"
    :output-path="repackOutputPath"
    :replacements="repackReplacements"
  />

  <!-- Skin picker dialog (car opened from the library) -->
  <SkinPickerDialog
    :open="skinPickerOpen"
    :car-name="skinCarName"
    :skins="skins"
    :is-loading="isLoadingSkins"
    :error="skinPickerError"
    @update:open="(v: boolean) => { if (!v) closeSkinPicker() }"
    @select="handleSkinSelected"
  />

  <!-- Car picker dialog -->
  <CarPickerDialog
    :open="testDialogOpen"
    :cars="cars"
    :ac-path="acPath"
    :is-loading="isLoadingCars"
    :selected-car-id="selectedCarId"
    :layouts="layouts"
    :selected-layout="selectedLayout"
    @update:open="(v) => { if (!v) closeTestDialog() }"
    @update:selected-car-id="selectCar"
    @update:selected-layout="selectLayout"
    @launch="handleLaunchTest"
  />

  <!-- Testing overlay (blocks app while AC is running) -->
  <TestingOverlay v-if="isTesting" />

  <Toaster />
</template>
