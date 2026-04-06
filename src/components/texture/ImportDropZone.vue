<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import { FolderInputIcon } from 'lucide-vue-next'
import { ref } from 'vue'

const emit = defineEmits<{
  import: [path: string]
}>()

const isDragOver = ref(false)

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = true
}

function handleDragLeave() {
  isDragOver.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  const item = e.dataTransfer?.items[0]
  if (!item) return
  const entry = item.webkitGetAsEntry?.()
  if (entry?.isDirectory) {
    emit('import', (entry as FileSystemDirectoryEntry).fullPath)
    return
  }
  const file = e.dataTransfer?.files[0]
  if (file) emit('import', file.path ?? '')
}

async function handleClick() {
  const dir = await open({ directory: true, multiple: false })
  if (dir && !Array.isArray(dir)) emit('import', dir)
}

defineExpose({
  FolderInputIcon,
  isDragOver,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleClick,
})
</script>

<template>
  <div
    class="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors bg-background/80 backdrop-blur-sm shadow-sm"
    :class="
      isDragOver
        ? 'border-primary bg-primary/10 text-primary'
        : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
    "
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @click="handleClick"
  >
    <div class="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
      <FolderInputIcon :size="16" />
    </div>
    <div>
      <p class="text-xs font-medium">Import replacement textures</p>
      <p class="text-[11px]">Drop a folder of PNGs or click to browse</p>
    </div>
  </div>
</template>
