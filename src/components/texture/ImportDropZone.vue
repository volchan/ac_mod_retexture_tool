<script setup lang="ts">
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { open } from '@tauri-apps/plugin-dialog'
import { UploadIcon } from 'lucide-vue-next'
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

defineExpose({ UploadIcon, isDragOver, handleClick })
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-2 m-3.5 px-4 py-4 rounded-[10px] border-2 border-dashed cursor-pointer transition-all text-center"
    :class="
      isDragOver
        ? 'border-primary bg-[var(--accent-muted)]'
        : 'border-border hover:border-primary/50 hover:bg-muted/60'
    "
    @click="handleClick"
  >
    <!-- Icon box -->
    <div
      class="w-[34px] h-[34px] rounded-lg bg-card border border-border flex items-center justify-center shrink-0 text-primary"
    >
      <UploadIcon :size="16" />
    </div>

    <!-- Text -->
    <div>
      <p class="text-[13px] font-medium text-foreground">Drop a folder of replacement textures</p>
      <p class="text-[11.5px] text-muted-foreground mt-0.5">
        Matched by filename · dimension mismatches flagged
      </p>
    </div>

    <!-- Keyboard hint -->
    <kbd class="font-mono text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground border border-border font-medium">
      ⌘I
    </kbd>
  </div>
</template>
