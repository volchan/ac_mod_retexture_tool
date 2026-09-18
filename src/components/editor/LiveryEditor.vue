<script setup lang="ts">
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useElementSize, useEventListener, watchDebounced } from '@vueuse/core'
import type Konva from 'konva'
import {
  BoxIcon,
  CheckIcon,
  GridIcon,
  MaximizeIcon,
  Redo2Icon,
  Undo2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import CarPreview from '@/components/editor/CarPreview.vue'
import EditorCanvas from '@/components/editor/EditorCanvas.vue'
import EditorToolbar from '@/components/editor/EditorToolbar.vue'
import LayerPanel from '@/components/editor/LayerPanel.vue'
import { Button } from '@/components/ui/button'
import { useBucketMasks } from '@/composables/useBucketMasks'
import { useCarPreview } from '@/composables/useCarPreview'
import { useEditorTools } from '@/composables/useEditorTools'
import { useEditorViewport } from '@/composables/useEditorViewport'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import { useLiveryEditor } from '@/composables/useLiveryEditor'
import { useLiveryPersistence } from '@/composables/useLiveryPersistence'
import { useUvTemplate } from '@/composables/useUvTemplate'
import type { CarHover } from '@/lib/carScene'

const { texture, baseDataUrl, restoredDocument, carPath, close } = useLiveryEditor()
const { document, layers, init, reset, canUndo, canRedo, undo, redo, selectedId, removeLayer } =
  useLiveryDocument()
const { isSaving, save } = useLiveryPersistence()
const { addImageFromPath, isImagePath, imageError } = useEditorTools()
const { clearMasks } = useBucketMasks()
const {
  isEnabled: uvEnabled,
  opacity: uvOpacity,
  image: uvTemplate,
  isLoading: uvLoading,
  error: uvError,
  toggle: toggleUv,
  reset: resetUv,
} = useUvTemplate()
const {
  isEnabled: carEnabled,
  mesh: carMesh,
  isLoading: carLoading,
  error: carError,
  toggle: toggleCar,
  reset: resetCar,
} = useCarPreview()

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

watch(texture, (next) => {
  // Masks belong to the texture they were filled on, and each one is as large as
  // that texture, so nothing survives the switch.
  clearMasks()
  resetUv()
  resetCar()
  if (!next) {
    reset()
    return
  }
  init(next, restoredDocument.value ?? undefined)
  resetView()
})

/// Saving flattens the stage and serialises the document, so both have to exist
/// first. Without this the button is live during the frames the base texture is
/// still decoding, and a fast click writes an empty edit over a real texture.
const canSave = computed(() => document.value !== null && baseImage.value !== null)

async function handleSave() {
  const stage = canvasRef.value?.getStage()
  if (!stage || !texture.value || !canSave.value) return
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
    // Without this the editor sits on a null base forever: Save stays disabled,
    // the canvas stays blank, and nothing anywhere says the texture is the reason.
    img.onerror = () => {
      if (baseDataUrl.value !== url) return
      baseImage.value = null
      toast.error(`Could not read ${texture.value?.name ?? 'the texture'}`)
    }
    img.src = url
  },
  { immediate: true },
)

watch(imageError, (message) => {
  if (!message) return
  toast.error(message)
  imageError.value = null
})

/// The outlines come from the car model, which never mentions a texture only the
/// skin folder adds: saying so beats leaving an empty overlay switched on.
async function handleToggleUv() {
  await toggleUv(texture.value, carPath.value)
  if (uvError.value) toast.error(uvError.value)
}

async function handleToggleCar() {
  await toggleCar(texture.value, carPath.value)
  if (carError.value) toast.error(carError.value)
}

/// Short enough to feel live while drawing, long enough that a stroke made of
/// dozens of points does not redraw the car once per point.
const liveryRevision = ref(0)
watchDebounced(layers, () => (liveryRevision.value += 1), { deep: true, debounce: 80 })

/// A hover on the car answers "where is this panel on the sheet": the texture
/// coordinate becomes a pixel, and the part's own name says what it is.
const hover = shallowRef<CarHover | null>(null)
const hoverPoint = computed(() => {
  if (!hover.value) return null
  return {
    x: hover.value.u * textureSize.value.width,
    y: hover.value.v * textureSize.value.height,
  }
})

const texturePoint = shallowRef<{ x: number; y: number } | null>(null)

const stage = shallowRef<Konva.Stage | null>(null)
watch(canvasRef, (handle) => {
  stage.value = handle?.getStage() ?? null
})

const zoomPercent = computed(() => Math.round(effectiveScale.value * 100))

let stopDragDrop: (() => void) | null = null

/// Dropping a sponsor PNG straight onto the livery, rather than hunting for it in a
/// file dialog, is how a skin actually gets built.
let unmounted = false

onMounted(async () => {
  const stop = await getCurrentWebview().onDragDropEvent(async (event) => {
    if (event.payload.type !== 'drop' || !texture.value) return
    for (const path of event.payload.paths.filter(isImagePath)) {
      await addImageFromPath(path)
    }
  })

  // The listener is registered on the webview, which outlives this component.
  // Closing the editor before the registration resolves leaves `onUnmounted`
  // nothing to detach, and drops keep injecting layers into a closed document.
  if (unmounted) {
    stop()
    return
  }
  stopDragDrop = stop
})

onUnmounted(() => {
  unmounted = true
  stopDragDrop?.()
})

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
  canSave,
  handleSave,
  isSaving,
  canvasRef,
  EditorToolbar,
  CheckIcon,
  GridIcon,
  uvEnabled,
  uvOpacity,
  uvTemplate,
  uvLoading,
  handleToggleUv,
  BoxIcon,
  CarPreview,
  carEnabled,
  carMesh,
  carLoading,
  handleToggleCar,
  stage,
  liveryRevision,
  hover,
  hoverPoint,
  texturePoint,
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
        <Button
          variant="ghost"
          size="icon"
          title="Show the car in 3D"
          :class="carEnabled ? 'text-sky-500' : ''"
          :disabled="carLoading"
          @click="handleToggleCar"
        >
          <BoxIcon class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Show the car's UV seams over the texture"
          :class="uvEnabled ? 'text-sky-500' : ''"
          :disabled="uvLoading"
          @click="handleToggleUv"
        >
          <GridIcon class="size-4" />
        </Button>
        <input
          v-if="uvEnabled && uvTemplate"
          v-model.number="uvOpacity"
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          class="w-20 accent-sky-500"
          title="UV guide opacity"
        />

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
        <Button size="sm" :disabled="isSaving || !canSave" @click="handleSave">
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
          :uv-template="uvEnabled ? uvTemplate : null"
          :uv-opacity="uvOpacity"
          :hover-point="hoverPoint"
          @hover-texture="texturePoint = $event"
        />
      </div>

      <div v-if="carEnabled && carMesh" class="relative w-2/5 shrink-0 border-l">
        <CarPreview
          :mesh="carMesh"
          :stage="stage"
          :texture-width="textureSize.width"
          :texture-height="textureSize.height"
          :revision="liveryRevision"
          :texture-point="texturePoint"
          @hover="hover = $event"
        />
        <span
          v-if="hover"
          class="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/70 px-2 py-1 text-xs text-white"
        >
          {{ hover.part }}
        </span>
      </div>

      <LayerPanel />
    </div>
  </div>
</template>
