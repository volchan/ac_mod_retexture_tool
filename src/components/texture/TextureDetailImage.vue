<script setup lang="ts">
import { AlertCircleIcon, Loader2Icon, ZoomInIcon, ZoomOutIcon } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useTextureDetail } from '@/composables/useTextureDetail'
import { convertFileSrc } from '@/lib/tauri'

const { activeTexture, activeTab, originalDataUrl, isLoadingOriginal, loadError, setTab } =
  useTextureDetail()

const replacementFullUrl = computed(() =>
  activeTexture.value?.replacement
    ? convertFileSrc(activeTexture.value.replacement.sourcePath)
    : null,
)

const displaySrc = computed((): string | null => {
  if (activeTab.value === 'replacement') return replacementFullUrl.value
  return originalDataUrl.value
})

const containerRef = ref<HTMLElement | null>(null)
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
  if (e.button !== 0) return
  isDragging.value = true
  dragStartX = e.clientX - offsetX.value
  dragStartY = e.clientY - offsetY.value
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  offsetX.value = e.clientX - dragStartX
  offsetY.value = e.clientY - dragStartY
}

function onMouseUp() {
  isDragging.value = false
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
  Loader2Icon,
  ZoomInIcon,
  ZoomOutIcon,
  activeTexture,
  activeTab,
  originalDataUrl,
  isLoadingOriginal,
  loadError,
  replacementFullUrl,
  displaySrc,
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
  onWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
})
</script>

<template>
  <div class="flex flex-col h-full min-w-0">
    <div v-if="activeTexture?.replacement" data-testid="tab-strip" class="flex border-b shrink-0">
      <button
        v-for="tab in ['original', 'replacement'] as const"
        :key="tab"
        class="px-4 py-2 text-xs font-medium border-b-2 transition-colors capitalize"
        :class="
          activeTab === tab
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        "
        @click="setTab(tab)"
      >
        {{ tab }}
      </button>
    </div>

    <div
      ref="containerRef"
      class="flex-1 checkerboard flex items-center justify-center relative overflow-hidden select-none"
      :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
      @mousedown="onMouseDown"
    >
      <div
        v-if="isLoadingOriginal && activeTab === 'original'"
        class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-sm"
      >
        <Loader2Icon class="animate-spin text-foreground" :size="36" />
        <span class="text-xs text-muted-foreground">Loading texture…</span>
      </div>

      <div
        v-else-if="loadError && activeTab === 'original'"
        class="flex flex-col items-center gap-2 text-muted-foreground p-6 text-center"
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

      <img
        v-if="displaySrc"
        :src="displaySrc"
        :alt="activeTexture?.name"
        class="max-w-none pointer-events-none"
        :class="isLoadingOriginal ? 'opacity-40' : ''"
        :style="{ transform: imageTransform }"
        draggable="false"
      />
    </div>

    <div class="flex items-center justify-center gap-1 px-3 py-1.5 border-t bg-card/50 shrink-0">
      <button
        class="p-1.5 rounded hover:bg-accent transition-colors"
        title="Zoom out"
        @click="zoomOut"
      >
        <ZoomOutIcon :size="13" class="text-muted-foreground" />
      </button>
      <button
        class="text-[11px] text-muted-foreground hover:text-foreground transition-colors min-w-[3.5rem] text-center tabular-nums"
        title="Reset zoom"
        @click="resetView"
      >
        {{ zoomPercent }}%
      </button>
      <button
        class="p-1.5 rounded hover:bg-accent transition-colors"
        title="Zoom in"
        @click="zoomIn"
      >
        <ZoomInIcon :size="13" class="text-muted-foreground" />
      </button>
    </div>
  </div>
</template>
