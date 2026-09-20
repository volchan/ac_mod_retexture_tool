<script setup lang="ts">
import { useElementSize, useRafFn } from '@vueuse/core'
import { AlertCircleIcon, CameraIcon } from 'lucide-vue-next'
import { onBeforeUnmount, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import Spinner from '@/components/ui/spinner/Spinner.vue'
import { useLiveryPreview } from '@/composables/useLiveryPreview'
import { PREVIEW_SIZE, useSkinArt } from '@/composables/useSkinArt'
import { createLiveryScene, type LiveryScene } from '@/lib/liveryScene'

/// Long enough for the rest of a failing skin to arrive, short enough that the
/// message still lands while the user is looking at the black panels.
const TEXTURE_ERROR_GRACE_MS = 250

const { isOpen, isLoading, error, model, shown, close } = useLiveryPreview()
const { savePreview, isSaving } = useSkinArt()

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
  scene = createLiveryScene(element, loaded, reportTextureError)
  scene.resize(width.value, height.value)
  resume()
})

watch([width, height], ([w, h]) => scene?.resize(w, h))

/// A texture that will not decode leaves its panels black, which reads as a paint
/// choice rather than a failure unless something says otherwise.
///
/// The loads all fail within the same frame or two, and a car whose whole skin is
/// unreadable names sixty of them: one toast each buries the screen, so they are
/// gathered and reported together.
const failed = new Set<string>()
let pendingReport: ReturnType<typeof setTimeout> | null = null

function reportTextureError(name: string) {
  failed.add(name)
  if (pendingReport) return
  pendingReport = setTimeout(flushTextureErrors, TEXTURE_ERROR_GRACE_MS)
}

function flushTextureErrors() {
  pendingReport = null
  const names = [...failed]
  failed.clear()
  if (names.length === 0) return
  if (names.length === 1) {
    toast.error(`Could not draw ${names[0]}`)
    return
  }
  toast.error(`Could not draw ${names.length} textures`, { description: names.join(', ') })
}

/// The capture is taken from the scene the user is looking at, framing and all:
/// what they lined up is what AC's selection screen will show.
async function useAsSkinPreview() {
  const target = shown.value
  if (!scene || !target) return

  try {
    const shot = scene.capture(PREVIEW_SIZE.width, PREVIEW_SIZE.height)
    await savePreview(target.carPath, target.skin, shot)
    toast.success('Saved as this skin\u2019s preview')
  } catch (e) {
    toast.error('Could not save the preview', {
      description: e instanceof Error ? e.message : String(e),
    })
  }
}

onBeforeUnmount(() => {
  if (pendingReport) clearTimeout(pendingReport)
  pause()
  scene?.dispose()
  scene = null
})

defineExpose({
  AlertCircleIcon,
  CameraIcon,
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
  isSaving,
  useAsSkinPreview,
})
</script>

<template>
  <Dialog :open="isOpen" @update:open="close">
    <DialogContent
      class="flex w-[95vw] sm:max-w-none h-[90vh] flex-col p-0 gap-0 overflow-hidden [&>[data-slot=dialog-close]]:top-2 [&>[data-slot=dialog-close]]:right-4"
    >
      <div class="flex items-center gap-3 border-b px-4 py-2">
        <DialogTitle class="text-[12px] font-medium">Livery preview</DialogTitle>

        <button
          v-if="model"
          class="ml-auto mr-8 flex items-center gap-1.5 rounded-[6px] border border-border px-2 py-1 text-[11px] font-medium disabled:opacity-50"
          :disabled="isSaving"
          @click="useAsSkinPreview"
        >
          <CameraIcon :size="13" />
          {{ isSaving ? 'Saving\u2026' : 'Use as skin preview' }}
        </button>
      </div>

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
