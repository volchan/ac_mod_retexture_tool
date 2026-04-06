<script setup lang="ts">
import { HexagonIcon, ImageIcon } from 'lucide-vue-next'
import WorkspaceLayout from '@/components/layout/WorkspaceLayout.vue'
import ModDropZone from '@/components/mod/ModDropZone.vue'
import ModTree from '@/components/mod/ModTree.vue'
import TexturePanel from '@/components/texture/TexturePanel.vue'
import { useMod } from '@/composables/useMod'

const { mod, loadMod, closeMod } = useMod()

defineExpose({
  HexagonIcon,
  ImageIcon,
  WorkspaceLayout,
  ModDropZone,
  ModTree,
  TexturePanel,
  mod,
  loadMod,
  closeMod,
})
</script>

<template>
  <WorkspaceLayout :mod-name="mod?.meta.name">
    <template #left>
      <ModDropZone v-if="!mod" @drop="loadMod" />
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
      <div class="flex flex-col items-center justify-center gap-2 text-muted-foreground h-full">
        <HexagonIcon :size="48" class="opacity-30" />
        <span class="text-sm">Load a mod to edit its info</span>
      </div>
    </template>
  </WorkspaceLayout>
</template>
