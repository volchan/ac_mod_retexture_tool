<script setup lang="ts">
import { HexagonIcon, ImageIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import WorkspaceLayout from '@/components/layout/WorkspaceLayout.vue'
import ModDropZone from '@/components/mod/ModDropZone.vue'
import ModTree from '@/components/mod/ModTree.vue'
import ModInfoPanel from '@/components/repack/ModInfoPanel.vue'
import RepackDialog from '@/components/repack/RepackDialog.vue'
import TexturePanel from '@/components/texture/TexturePanel.vue'
import Toaster from '@/components/ui/sonner/Toaster.vue'
import { useMod } from '@/composables/useMod'
import { useTextures } from '@/composables/useTextures'
import { showSaveDialog } from '@/lib/tauri'
import type { TextureReplacementOpt } from '@/types/index'

const { mod, loadMod, closeMod } = useMod()
const { textures, selected } = useTextures()

const textureCount = computed(() => textures.value.length)
const selectedCount = computed(() => selected.value.size)

const repackOpen = ref(false)
const repackOutputPath = ref('')
const repackReplacements = ref<TextureReplacementOpt[]>([])

async function handleDrop(path: string) {
  const result = await loadMod(path)
  if (result?.error) {
    toast.error(result.error)
    return
  }
  if (mod.value?.modType !== 'track') {
    closeMod()
    toast.error('Only track mods are supported for now.')
  }
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

defineExpose({
  HexagonIcon,
  ImageIcon,
  WorkspaceLayout,
  ModDropZone,
  ModTree,
  RepackDialog,
  ModInfoPanel,
  TexturePanel,
  Toaster,
  mod,
  loadMod,
  closeMod,
  textureCount,
  selectedCount,
  repackOpen,
  repackOutputPath,
  repackReplacements,
  handleDrop,
  handleRepack,
})
</script>

<template>
  <WorkspaceLayout
    :mod-name="mod?.meta.name"
    :texture-count="textureCount"
    :selected-count="selectedCount"
  >
    <template #left>
      <ModDropZone v-if="!mod" @drop="handleDrop" />
      <ModTree v-else :mod="mod" @close="closeMod" />
    </template>
    <template #center>
      <TexturePanel v-if="mod" :mod="mod" />
      <div
        v-else
        class="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground"
      >
        <ImageIcon :size="48" class="opacity-30" />
        <span class="text-sm">Drop a mod folder to preview textures</span>
      </div>
    </template>
    <template #right>
      <ModInfoPanel v-if="mod" :mod="mod" @repack="handleRepack" />
      <div
        v-else
        class="flex flex-col items-center justify-center gap-2 text-muted-foreground h-full"
      >
        <HexagonIcon :size="48" class="opacity-30" />
        <span class="text-sm">Load a mod to edit its info</span>
      </div>
    </template>
  </WorkspaceLayout>

  <RepackDialog
    v-if="mod && repackOpen"
    :open="repackOpen"
    :mod="mod"
    :output-path="repackOutputPath"
    :replacements="repackReplacements"
    @update:open="repackOpen = $event"
    @done="repackOpen = false"
  />

  <Toaster />
</template>
