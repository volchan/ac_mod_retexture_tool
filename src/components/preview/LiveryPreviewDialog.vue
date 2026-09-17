<script setup lang="ts">
import { useElementSize, useRafFn } from '@vueuse/core'
import { AlertCircleIcon } from 'lucide-vue-next'
import { onBeforeUnmount, ref, watch } from 'vue'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import Spinner from '@/components/ui/spinner/Spinner.vue'
import { useLiveryPreview } from '@/composables/useLiveryPreview'
import { createLiveryScene, type LiveryScene } from '@/lib/liveryScene'

const { isOpen, isLoading, error, model, close } = useLiveryPreview()

const host = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const { width, height } = useElementSize(host)

let scene: LiveryScene | null = null

const { pause, resume } = useRafFn(() => scene?.render(), { immediate: false })

watch([canvas, model], ([element, loaded]) => {
  scene?.dispose()
  scene = null
  if (!element || !loaded) {
    pause()
    return
  }
  scene = createLiveryScene(element, loaded)
  scene.resize(width.value, height.value)
  resume()
})

watch([width, height], ([w, h]) => scene?.resize(w, h))

onBeforeUnmount(() => {
  pause()
  scene?.dispose()
  scene = null
})

defineExpose({
  AlertCircleIcon,
  Dialog,
  DialogContent,
  DialogTitle,
  Spinner,
  isOpen,
  isLoading,
  error,
  model,
  host,
  canvas,
  close,
})
</script>

<template>
  <Dialog :open="isOpen" @update:open="close">
    <DialogContent class="max-w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden">
      <DialogTitle class="border-b px-4 py-2 text-[12px] font-medium">Livery preview</DialogTitle>

      <div ref="host" class="relative flex-1 min-h-0 bg-muted/20">
        <canvas v-if="model" ref="canvas" class="size-full" />

        <div
          v-else
          class="flex size-full flex-col items-center justify-center gap-3 text-muted-foreground"
        >
          <template v-if="isLoading">
            <Spinner :size="20" />
            <p class="text-[12px]">Reading the car and its textures…</p>
          </template>
          <template v-else-if="error">
            <AlertCircleIcon :size="28" class="text-destructive" />
            <p class="text-[12px]">{{ error }}</p>
          </template>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
