<script setup lang="ts">
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { open } from '@tauri-apps/plugin-dialog'
import { FolderInputIcon } from 'lucide-vue-next'
import { onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits<{
  import: [path: string]
}>()

const isDragOver = ref(false)
let unlisten: (() => void) | null = null

onMounted(async () => {
  const webview = getCurrentWebviewWindow()
  unlisten = await webview.onDragDropEvent((event) => {
    if (event.payload.type === 'over') {
      isDragOver.value = true
    } else if (event.payload.type === 'leave') {
      isDragOver.value = false
    } else if (event.payload.type === 'drop') {
      isDragOver.value = false
      const paths = event.payload.paths
      if (paths.length > 0) emit('import', paths[0])
    }
  })
})

onUnmounted(() => {
  unlisten?.()
})

async function handleClick() {
  const dir = await open({ directory: true, multiple: false })
  if (dir && !Array.isArray(dir)) emit('import', dir)
}

defineExpose({
  FolderInputIcon,
  isDragOver,
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
