<script setup lang="ts">
import {
  AlertCircleIcon,
  ChevronsLeftRightIcon,
  Loader2Icon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useTextureDetail } from '@/composables/useTextureDetail'
import { loadReplacementFull } from '@/lib/tauri'

const { activeTexture, activeTab, originalDataUrl, isLoadingOriginal, loadError, setTab } =
  useTextureDetail()

const replacementDataUrl = ref<string | null>(null)
const isLoadingReplacement = ref(false)

watch(
  () => activeTexture.value?.replacement?.sourcePath,
  async (sourcePath) => {
    if (!sourcePath) {
      replacementDataUrl.value = null
      return
    }
    isLoadingReplacement.value = true
    try {
      replacementDataUrl.value = await loadReplacementFull(sourcePath)
    } catch {
      replacementDataUrl.value = null
    } finally {
      isLoadingReplacement.value = false
    }
  },
  { immediate: true },
)

const hasComparison = computed(
  () => !!activeTexture.value?.replacement && !!replacementDataUrl.value,
)

// Compare slider
const sliderPct = ref(50)
const isSliding = ref(false)
const containerRef = ref<HTMLElement | null>(null)

function startSlide(e: MouseEvent) {
  e.stopPropagation()
  e.preventDefault()
  isSliding.value = true
}

function updateSlider(e: MouseEvent) {
  if (!isSliding.value || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const W = rect.width
  const mouseX = e.clientX - rect.left
  // Invert the zoom+offset transform to find the element-local clip position
  const raw = 50 + ((mouseX - W / 2 - offsetX.value) / (zoom.value * W)) * 100
  sliderPct.value = Math.max(0, Math.min(100, raw))
}

function stopSlide() {
  isSliding.value = false
}

watch(hasComparison, (v) => {
  if (v) sliderPct.value = 50
})

// Visual pixel position of the slider, accounting for zoom and pan offset
const sliderVisualX = computed(() => {
  const W = containerRef.value?.clientWidth ?? 0
  const x = (sliderPct.value / 100 - 0.5) * zoom.value * W + W / 2 + offsetX.value
  return Math.max(0, Math.min(W, x))
})

// Image pan + zoom
const zoom = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const isDragging = ref(false)
let dragStartX = 0
let dragStartY = 0

const imageTransform = computed(
  () => `translate(${offsetX.value}px, ${offsetY.value}px) scale(${zoom.value})`,
)

const zoomPercent = computed(() => Math.round(zoom.value * 100))

function resetView() {
  zoom.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

function zoomIn() {
  zoom.value = Math.min(20, zoom.value * 1.25)
}

function zoomOut() {
  zoom.value = Math.max(0.1, zoom.value / 1.25)
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const rect = (containerRef.value as HTMLElement).getBoundingClientRect()
  const cx = e.clientX - rect.left - rect.width / 2
  const cy = e.clientY - rect.top - rect.height / 2
  const factor = e.deltaY < 0 ? 1.1 : 0.9
  const newZoom = Math.max(0.1, Math.min(20, zoom.value * factor))
  const ratio = newZoom / zoom.value
  offsetX.value = cx - (cx - offsetX.value) * ratio
  offsetY.value = cy - (cy - offsetY.value) * ratio
  zoom.value = newZoom
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0 || isSliding.value) return
  isDragging.value = true
  dragStartX = e.clientX - offsetX.value
  dragStartY = e.clientY - offsetY.value
}

function onMouseMove(e: MouseEvent) {
  updateSlider(e)
  if (!isDragging.value) return
  offsetX.value = e.clientX - dragStartX
  offsetY.value = e.clientY - dragStartY
}

function onMouseUp() {
  isDragging.value = false
  stopSlide()
}

watch(
  () => activeTexture.value?.id,
  () => resetView(),
)

let containerEl!: HTMLElement

onMounted(() => {
  containerEl = containerRef.value as HTMLElement
  containerEl.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
})

onUnmounted(() => {
  containerEl.removeEventListener('wheel', onWheel)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
})

defineExpose({
  AlertCircleIcon,
  ChevronsLeftRightIcon,
  Loader2Icon,
  ZoomInIcon,
  ZoomOutIcon,
  activeTexture,
  activeTab,
  originalDataUrl,
  isLoadingOriginal,
  loadError,
  replacementDataUrl,
  isLoadingReplacement,
  hasComparison,
  sliderPct,
  sliderVisualX,
  isSliding,
  zoom,
  offsetX,
  offsetY,
  isDragging,
  imageTransform,
  zoomPercent,
  setTab,
  resetView,
  zoomIn,
  zoomOut,
  startSlide,
  stopSlide,
  onWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
})
</script>

<template>
  <div class="flex flex-col h-full min-w-0">
    <div
      ref="containerRef"
      class="flex-1 checkerboard relative overflow-hidden select-none"
      :class="isSliding ? 'cursor-ew-resize' : isDragging ? 'cursor-grabbing' : 'cursor-grab'"
      @mousedown="onMouseDown"
    >
      <!-- Loading overlay -->
      <div
        v-if="isLoadingOriginal || isLoadingReplacement"
        class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-sm"
      >
        <Loader2Icon class="animate-spin text-foreground" :size="36" />
        <span class="text-xs text-muted-foreground">Loading texture…</span>
      </div>

      <!-- Error state -->
      <div
        v-else-if="loadError"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground p-6 text-center"
      >
        <AlertCircleIcon :size="32" class="text-destructive" />
        <p class="text-sm">{{ loadError }}</p>
        <button
          class="text-xs px-3 py-1.5 rounded border hover:bg-accent transition-colors"
          @click="setTab('original')"
        >
          Retry
        </button>
      </div>

      <!-- Image layer: both images share the same transform for pixel-perfect alignment -->
      <template v-else>
        <!-- Original (base layer, always full width) -->
        <img
          v-if="originalDataUrl"
          :src="originalDataUrl"
          :alt="activeTexture?.name"
          class="absolute inset-0 w-full h-full object-contain max-w-none pointer-events-none"
          :style="{ transform: imageTransform }"
          draggable="false"
        />

        <!-- Replacement (clipped to left of slider when in compare mode) -->
        <img
          v-if="replacementDataUrl"
          :src="replacementDataUrl"
          :alt="activeTexture?.name"
          class="absolute inset-0 w-full h-full object-contain max-w-none pointer-events-none"
          :style="{
            transform: imageTransform,
            clipPath: hasComparison ? `inset(0 ${100 - sliderPct}% 0 0)` : undefined,
          }"
          draggable="false"
        />

        <!-- Compare slider UI -->
        <template v-if="hasComparison">
          <!-- Divider line -->
          <div
            class="absolute top-0 bottom-0 w-px bg-white/80 z-10 pointer-events-none"
            :style="{ left: `${sliderVisualX}px` }"
          />

          <!-- Handle -->
          <div
            class="absolute top-1/2 z-10 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center cursor-ew-resize"
            :style="{ left: `${sliderVisualX}px` }"
            @mousedown.stop.prevent="startSlide"
          >
            <ChevronsLeftRightIcon :size="14" class="text-foreground/70" />
          </div>

          <!-- Labels -->
          <div class="absolute top-2.5 left-3 z-10 pointer-events-none">
            <span class="text-[10.5px] font-semibold px-1.5 py-px rounded bg-black/40 text-white">
              Replacement
            </span>
          </div>
          <div class="absolute top-2.5 right-3 z-10 pointer-events-none">
            <span class="text-[10.5px] font-semibold px-1.5 py-px rounded bg-black/40 text-white">
              Original
            </span>
          </div>
        </template>
      </template>
    </div>

    <!-- Zoom controls -->
    <div class="flex items-center justify-center gap-1 px-3 py-1.5 border-t bg-card/50 shrink-0">
      <button
        type="button"
        class="p-1.5 rounded hover:bg-accent transition-colors"
        title="Zoom out"
        aria-label="Zoom out"
        @click="zoomOut"
      >
        <ZoomOutIcon :size="13" class="text-muted-foreground" />
      </button>
      <button
        type="button"
        class="text-[11px] text-muted-foreground hover:text-foreground transition-colors min-w-[3.5rem] text-center tabular-nums"
        title="Reset zoom"
        aria-label="Reset zoom"
        @click="resetView"
      >
        {{ zoomPercent }}%
      </button>
      <button
        type="button"
        class="p-1.5 rounded hover:bg-accent transition-colors"
        title="Zoom in"
        aria-label="Zoom in"
        @click="zoomIn"
      >
        <ZoomInIcon :size="13" class="text-muted-foreground" />
      </button>
    </div>
  </div>
</template>
