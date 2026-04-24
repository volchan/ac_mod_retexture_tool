<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import CommandPalette from '@/components/CommandPalette.vue'
import WorkspaceLayout from '@/components/layout/WorkspaceLayout.vue'
import RepackDialog from '@/components/repack/RepackDialog.vue'
import Toaster from '@/components/ui/sonner/Toaster.vue'
import { useGlobalCommands } from '@/composables/useGlobalCommands'
import { useLibrary } from '@/composables/useLibrary'
import { useMod } from '@/composables/useMod'
import { useTextureFilter } from '@/composables/useTextureFilter'
import { useTextures } from '@/composables/useTextures'
import { useTheme } from '@/composables/useTheme'
import { showSaveDialog } from '@/lib/tauri'
import type { Texture, TextureReplacementOpt } from '@/types/index'
import LibraryView from '@/views/LibraryView.vue'

const { mod, loadMod, closeMod } = useMod()
const { textures, selected, selectAll, lastImportFolder } = useTextures()
const { recentMods, init: initLibrary, addRecent, updateTextureCount } = useLibrary()
const { reset: resetFilter } = useTextureFilter()
const { triggerExtract, triggerImport, triggerQueue } = useGlobalCommands()
const { cycleMode } = useTheme()

const focusedTexture = ref<Texture | null>(null)
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
  if (mod.value.modType !== 'track' && mod.value.modType !== 'car') {
    closeMod()
    toast.error('Unsupported mod type.')
    return
  }
  await addRecent(mod.value)
  focusedTexture.value = null
  resetFilter()
}

watch(
  () => textures.value.length,
  (count) => {
    if (mod.value && count > 0) updateTextureCount(mod.value.meta.folderName, count)
  },
)

async function handleBrowse() {
  const selected = await open({ directory: true, multiple: false })
  if (typeof selected === 'string') await handleDrop(selected)
}

async function handleOpenRecent(path: string) {
  await handleDrop(path)
}

function handleFocusTexture(texture: Texture) {
  focusedTexture.value = texture
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
      kn5File: t.kn5File,
      textureName: t.name,
      skinFolder: t.skinFolder,
      originalFormat: t.format,
      heroImagePath: t.category === 'preview' ? t.path : undefined,
    }))
  repackOpen.value = true
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
    focusedTexture.value = null
  }
  if (action === 'toggle-theme') cycleMode()
  if (action === 'queue') triggerQueue()
}

async function handleReplaceTexture() {
  const path = await open({
    directory: true,
    multiple: false,
    defaultPath: lastImportFolder.value,
  })
  if (typeof path === 'string') triggerImport(path)
}

defineExpose({
  CommandPalette,
  WorkspaceLayout,
  RepackDialog,
  LibraryView,
  Toaster,
  mod,
  loadMod,
  closeMod,
  textures,
  selected,
  lastImportFolder,
  focusedTexture,
  cmdPaletteOpen,
  repackOpen,
  repackOutputPath,
  repackReplacements,
  queueCount,
  selectedCount,
  recentMods,
  updateTextureCount,
  triggerQueue,
  handleDrop,
  handleBrowse,
  handleOpenRecent,
  handleFocusTexture,
  handleRepack,
  handleCmdAction,
  handleReplaceTexture,
})
</script>

<template>
  <!-- Library (no mod loaded) -->
  <LibraryView
    v-if="!mod"
    :recent-mods="recentMods"
    @open="handleOpenRecent"
    @browse="handleBrowse"
  />

  <!-- Workspace (mod loaded) -->
  <WorkspaceLayout
    v-else
    :mod="mod"
    :textures="textures"
    :focused-texture="focusedTexture"
    :queue-count="queueCount"
    @repack="handleRepack"
    @close="handleCmdAction('switch-mod')"
    @focus-texture="handleFocusTexture"
    @open-cmd="cmdPaletteOpen = true"
    @extract-texture="triggerExtract"
    @replace-texture="handleReplaceTexture"
  />

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

  <Toaster />
</template>
