<script setup lang="ts">
import { ChevronRightIcon, FileIcon, FolderIcon, ImageIcon } from 'lucide-vue-next'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import type { Mod } from '@/types/index'
import ModBadge from './ModBadge.vue'

const props = defineProps<{ mod: Mod }>()
const emit = defineEmits<{ close: [] }>()

const openFolders = ref(new Set<string>())

function toggleFolder(name: string) {
  const next = new Set(openFolders.value)
  if (next.has(name)) {
    next.delete(name)
  } else {
    next.add(name)
  }
  openFolders.value = next
}

defineExpose({
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  ImageIcon,
  Button,
  ModBadge,
  props,
  emit,
  openFolders,
  toggleFolder,
})
</script>

<template>
  <div class="flex flex-col h-full gap-2">
    <div class="flex items-center gap-2 min-w-0">
      <ModBadge :type="props.mod.type" />
      <span class="text-sm font-medium truncate">{{ props.mod.meta.name }}</span>
    </div>

    <div class="flex-1 overflow-auto">
      <ul class="flex flex-col gap-0.5">
        <li
          v-for="kn5 in props.mod.kn5Files"
          :key="kn5"
          class="flex items-center gap-2 text-xs py-1 px-1 rounded hover:bg-accent"
        >
          <FileIcon :size="14" class="shrink-0 text-muted-foreground" />
          <span class="truncate">{{ kn5.split('/').pop() }}</span>
        </li>

        <li v-for="skin in props.mod.skinFolders" :key="skin.name">
          <button
            type="button"
            class="flex items-center gap-2 text-xs py-1 px-1 rounded hover:bg-accent w-full text-left"
            @click="toggleFolder(skin.name)"
          >
            <ChevronRightIcon
              :size="14"
              class="shrink-0 text-muted-foreground transition-transform"
              :class="openFolders.has(skin.name) ? 'rotate-90' : ''"
            />
            <FolderIcon :size="14" class="shrink-0 text-muted-foreground" />
            <span class="truncate">{{ skin.name }}</span>
          </button>

          <ul v-if="openFolders.has(skin.name)" class="ml-6 flex flex-col gap-0.5">
            <li
              v-for="file in skin.files"
              :key="file.path"
              class="flex items-center gap-2 text-xs py-1 px-1 rounded hover:bg-accent"
            >
              <ImageIcon :size="14" class="shrink-0 text-muted-foreground" />
              <span class="truncate">{{ file.name }}</span>
            </li>
          </ul>
        </li>
      </ul>
    </div>

    <Button variant="ghost" size="sm" class="w-full" @click="emit('close')">Close mod</Button>
  </div>
</template>
