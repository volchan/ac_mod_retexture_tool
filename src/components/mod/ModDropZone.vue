<script setup lang="ts">
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { open } from '@tauri-apps/plugin-dialog'
import { DownloadIcon } from 'lucide-vue-next'
import { onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits<{ drop: [path: string] }>()

const isDraggingOver = ref(false)
let unlisten: (() => void) | null = null

onMounted(async () => {
  const webview = getCurrentWebviewWindow()
  unlisten = await webview.onDragDropEvent((event) => {
    if (event.payload.type === 'over') {
      isDraggingOver.value = true
    } else if (event.payload.type === 'leave') {
      isDraggingOver.value = false
    } else if (event.payload.type === 'drop') {
      isDraggingOver.value = false
      const paths = event.payload.paths
      if (paths.length > 0) {
        emit('drop', paths[0])
      }
    }
  })
})

onUnmounted(() => {
  unlisten?.()
})

async function handleClick() {
  const selected = await open({ directory: true, multiple: false })
  if (typeof selected === 'string') {
    emit('drop', selected)
  }
}

defineExpose({ DownloadIcon, isDraggingOver, handleClick })
</script>

<template>
  <div
    class="flex-1 flex flex-col h-full border-2 border-dashed rounded-lg cursor-pointer transition-colors"
    :class="isDraggingOver ? 'border-primary bg-primary/10' : 'border-muted-foreground/30'"
    @click="handleClick"
  >
    <div class="flex flex-col items-center justify-center gap-3 flex-1 p-4 text-center">
      <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <DownloadIcon :size="24" class="text-muted-foreground" />
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium">Drop mod folder here</span>
        <span class="text-xs text-muted-foreground">or click to browse</span>
      </div>
    </div>
  </div>
</template>
