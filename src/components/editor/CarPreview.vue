<script setup lang="ts">
import { useDebounceFn, useElementSize, useRafFn } from '@vueuse/core'
import type Konva from 'konva'
import { onBeforeUnmount, ref, watch } from 'vue'
import { type CarHover, type CarScene, createCarScene } from '@/lib/carScene'
import { stageToCanvas } from '@/lib/stageExport'
import type { CarMeshData } from '@/types/index'

const props = defineProps<{
  mesh: CarMeshData
  stage: Konva.Stage | null
  textureWidth: number
  textureHeight: number
  revision: number
  /// Texture pixel the pointer is over on the flat view, if any.
  texturePoint: { x: number; y: number } | null
}>()

const emit = defineEmits<{ hover: [CarHover | null] }>()

// Flattening an 8192 pixel sheet takes seconds, and a brush stroke asks for it
// on every event. So the car is redrawn twice: at once at a size the stroke can
// afford, and again at the sheet's own size once the hand has paused — a
// sponsor placed 280 pixels wide keeps 280 pixels, not the 70 a fixed cap left
// it, which read as a blur the moment the car was orbited close.
const QUICK_WIDTH = 2048
const SETTLE_MS = 300

const host = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const { width, height } = useElementSize(host)

let scene: CarScene | null = null

const { pause, resume } = useRafFn(() => scene?.render(), { immediate: false })

// The mesh belongs to a car, and a scene built for one draws the wrong body for
// the next. `LiveryEditor` happens to reset the preview on a texture change, but
// that is its business, not a promise this component can rest on.
watch([canvas, () => props.mesh], ([element]) => {
  scene?.dispose()
  scene = null
  if (!element) {
    pause()
    return
  }
  scene = createCarScene(element, props.mesh)
  scene.resize(width.value, height.value)
  resume()
  refreshTexture(sharpRatio())
})

watch([width, height], ([w, h]) => scene?.resize(w, h))

/// Pointing at the sheet lights up the panel that wears it, which is the only
/// way to tell what a small island belongs to without clicking around in 3D.
watch(
  () => props.texturePoint,
  (point) => {
    if (!point || props.textureWidth === 0) return
    scene?.showAt(point.x / props.textureWidth, point.y / props.textureHeight)
  },
)

/// Each edit rebuilds the livery, so the car shows what was just painted rather
/// than what the texture looked like when the panel opened.
const refreshSharp = useDebounceFn(() => refreshTexture(sharpRatio()), SETTLE_MS)
watch(
  () => props.revision,
  () => {
    refreshTexture(quickRatio())
    void refreshSharp()
  },
)

onBeforeUnmount(() => {
  pause()
  scene?.dispose()
  scene = null
})

/// The raycast runs against the same frame the user is looking at, so the marker
/// lands where the cursor is even mid-orbit.
function handlePointerMove(event: PointerEvent) {
  const element = canvas.value
  if (!element || !scene) return
  const box = element.getBoundingClientRect()
  emit(
    'hover',
    scene.pick((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height),
  )
}

function handlePointerLeave() {
  scene?.pick(-1, -1)
  emit('hover', null)
}

defineExpose({ host, canvas, handlePointerMove, handlePointerLeave })

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

function refreshTexture(ratio: number) {
  const stage = props.stage
  if (!stage || !scene || props.textureWidth === 0) return
  scene.setTexture(stageToCanvas(stage, props.textureWidth, props.textureHeight, ratio))
}

function quickRatio() {
  return Math.min(1, QUICK_WIDTH / props.textureWidth)
}

/// The sheet's own size, unless the GPU will not hold a texture that wide.
function sharpRatio() {
  const widest = scene?.maxTextureSize() ?? QUICK_WIDTH
  return Math.min(1, widest / Math.max(props.textureWidth, props.textureHeight))
}
</script>

<template>
  <div ref="host" class="relative size-full bg-muted/20">
    <canvas
      ref="canvas"
      class="size-full"
      @pointermove="handlePointerMove"
      @pointerleave="handlePointerLeave"
    />
  </div>
</template>
