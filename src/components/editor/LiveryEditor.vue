<script setup lang="ts">
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useElementSize, useEventListener } from '@vueuse/core'
import {
  CheckIcon,
  MaximizeIcon,
  Redo2Icon,
  Undo2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import EditorCanvas from '@/components/editor/EditorCanvas.vue'
import EditorToolbar from '@/components/editor/EditorToolbar.vue'
import LayerPanel from '@/components/editor/LayerPanel.vue'
import { Button } from '@/components/ui/button'
import { useBucketMasks } from '@/composables/useBucketMasks'
import { useEditorTools } from '@/composables/useEditorTools'
import { useEditorViewport } from '@/composables/useEditorViewport'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import { useLiveryEditor } from '@/composables/useLiveryEditor'
import { useLiveryPersistence } from '@/composables/useLiveryPersistence'

const { texture, baseDataUrl, close } = useLiveryEditor()
const { init, reset, canUndo, canRedo, undo, redo, selectedId, removeLayer } = useLiveryDocument()
const { isSaving, restore, save } = useLiveryPersistence()
const { addImageFromPath, isImagePath } = useEditorTools()
const { clearMasks } = useBucketMasks()

const canvasRef = ref<{ getStage: () => import('konva').default.Stage | null } | null>(null)
const canvasHost = ref<HTMLElement | null>(null)
const { width: hostWidth, height: hostHeight } = useElementSize(canvasHost)
const containerSize = computed(() => ({ width: hostWidth.value, height: hostHeight.value }))

const textureSize = computed(() => ({
  width: texture.value?.width ?? 0,
  height: texture.value?.height ?? 0,
}))

const { effectiveScale, stagePosition, zoomAt, panBy, resetView } = useEditorViewport(
  textureSize,
  containerSize,
)

const baseImage = shallowRef<HTMLImageElement | null>(null)

watch(texture, async (next) => {
  // Masks belong to the texture they were filled on, and each one is as large as
  // that texture, so nothing survives the switch.
  clearMasks()
  if (!next) {
    reset()
    return
  }
  const restored = await restore(next)
  // Guard against the editor closing or moving on while the stored stack loaded.
  if (texture.value?.id !== next.id) return
  init(next, restored)
  resetView()
})

async function handleSave() {
  const stage = canvasRef.value?.getStage()
  if (!stage || !texture.value) return
  try {
    await save(stage, texture.value)
    toast.success(`Saved ${texture.value.name}`)
    close()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e))
  }
}

watch(
  baseDataUrl,
  (url) => {
    if (!url) {
      baseImage.value = null
      return
    }
    const img = new Image()
    img.onload = () => {
      if (baseDataUrl.value === url) baseImage.value = img
    }
    img.src = url
  },
  { immediate: true },
)

const zoomPercent = computed(() => Math.round(effectiveScale.value * 100))

let stopDragDrop: (() => void) | null = null

/// Dropping a sponsor PNG straight onto the livery, rather than hunting for it in a
/// file dialog, is how a skin actually gets built.
onMounted(async () => {
  stopDragDrop = await getCurrentWebview().onDragDropEvent(async (event) => {
    if (event.payload.type !== 'drop' || !texture.value) return
    for (const path of event.payload.paths.filter(isImagePath)) {
      await addImageFromPath(path)
    }
  })
})

onUnmounted(() => stopDragDrop?.())

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (!texture.value || isTypingIn(e.target)) return

  if (e.key === 'Escape') {
    close()
    return
  }

  if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId.value) {
    e.preventDefault()
    removeLayer(selectedId.value)
    return
  }

  if (!(e.metaKey || e.ctrlKey)) return
  const key = e.key.toLowerCase()
  if (key === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  }
  if (key === 'y') {
    e.preventDefault()
    redo()
  }
})

/// A shortcut must never reach the canvas while the caret is in the text field:
/// backspace belongs to the word being typed, not to the selected layer.
function isTypingIn(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
}

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const host = canvasHost.value
  if (!host) return
  const box = host.getBoundingClientRect()
  zoomAt({ x: e.clientX - box.left, y: e.clientY - box.top }, e.deltaY < 0 ? 1 : -1)
}

function zoomFromButton(direction: number) {
  zoomAt({ x: containerSize.value.width / 2, y: containerSize.value.height / 2 }, direction)
}

defineExpose({
  Button,
  EditorCanvas,
  LayerPanel,
  MaximizeIcon,
  Redo2Icon,
  Undo2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
  texture,
  close,
  baseImage,
  containerSize,
  textureSize,
  effectiveScale,
  stagePosition,
  resetView,
  zoomPercent,
  canUndo,
  canRedo,
  undo,
  redo,
  handleWheel,
  panBy,
  zoomFromButton,
  handleSave,
  isSaving,
  canvasRef,
  EditorToolbar,
  CheckIcon,
})
</script>

<template>
  <div v-if="texture" class="fixed inset-0 z-50 flex flex-col bg-background">
    <header class="flex items-center gap-3 border-b px-4 py-2">
      <span class="text-sm font-medium">{{ texture.name }}</span>
      <span class="text-xs text-muted-foreground">
        {{ texture.width }}×{{ texture.height }}
      </span>

      <div class="ml-4 flex items-center gap-1">
        <Button variant="ghost" size="icon" title="Undo" :disabled="!canUndo" @click="undo">
          <Undo2Icon class="size-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Redo" :disabled="!canRedo" @click="redo">
          <Redo2Icon class="size-4" />
        </Button>
      </div>

      <div class="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" title="Zoom out" @click="zoomFromButton(-1)">
          <ZoomOutIcon class="size-4" />
        </Button>
        <span class="w-12 text-center text-xs tabular-nums">{{ zoomPercent }}%</span>
        <Button variant="ghost" size="icon" title="Zoom in" @click="zoomFromButton(1)">
          <ZoomInIcon class="size-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Fit to window" @click="resetView">
          <MaximizeIcon class="size-4" />
        </Button>
        <Button size="sm" :disabled="isSaving" @click="handleSave">
          <CheckIcon class="size-4" />
          Save as replacement
        </Button>
        <Button variant="ghost" size="icon" title="Close without saving" @click="close">
          <XIcon class="size-4" />
        </Button>
      </div>
    </header>

    <div class="flex flex-1 min-h-0">
      <EditorToolbar />

      <div
        ref="canvasHost"
        class="relative flex-1 min-h-0 overflow-hidden bg-muted/40"
        @wheel="handleWheel"
      >
        <EditorCanvas
          ref="canvasRef"
          @pan="panBy"
          :width="containerSize.width"
          :height="containerSize.height"
          :scale="effectiveScale"
          :position="stagePosition"
          :base-image="baseImage"
          :texture-width="textureSize.width"
          :texture-height="textureSize.height"
        />
      </div>

      <LayerPanel />
    </div>
  </div>
</template>
