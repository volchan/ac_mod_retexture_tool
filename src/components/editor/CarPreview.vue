<script setup lang="ts">
import { useElementSize, useRafFn } from '@vueuse/core'
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

// The livery is redrawn at a fraction of its real size: a 7168 pixel texture
// takes seconds to flatten, and the preview is a few hundred pixels wide.
const PREVIEW_WIDTH = 2048

const host = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const { width, height } = useElementSize(host)

let scene: CarScene | null = null

const { pause, resume } = useRafFn(() => scene?.render(), { immediate: false })

watch(canvas, (element) => {
  scene?.dispose()
  scene = null
  if (!element) {
    pause()
    return
  }
  scene = createCarScene(element, props.mesh)
  scene.resize(width.value, height.value)
  resume()
  refreshTexture()
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
watch(() => props.revision, refreshTexture)

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

function refreshTexture() {
  const stage = props.stage
  if (!stage || !scene || props.textureWidth === 0) return
  const ratio = Math.min(1, PREVIEW_WIDTH / props.textureWidth)
  scene.setTexture(stageToCanvas(stage, props.textureWidth, props.textureHeight, ratio))
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
