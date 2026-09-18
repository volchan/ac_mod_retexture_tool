<script setup lang="ts">
import {
  CircleIcon,
  EraserIcon,
  FlipHorizontal2Icon,
  FlipVertical2Icon,
  ImagePlusIcon,
  MousePointer2Icon,
  PaintBucketIcon,
  PencilIcon,
  PipetteIcon,
  SquareIcon,
  TypeIcon,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { useEditorTools } from '@/composables/useEditorTools'

const {
  tool,
  brushSize,
  brushColor,
  fillColor,
  fillTolerance,
  mirrorX,
  mirrorY,
  setTool,
  addImageLayer,
  addTextLayer,
  addShapeLayer,
} = useEditorTools()

const TOOLS = [
  { id: 'select', icon: MousePointer2Icon, label: 'Select and move' },
  { id: 'brush', icon: PencilIcon, label: 'Brush' },
  { id: 'eraser', icon: EraserIcon, label: 'Eraser' },
  { id: 'bucket', icon: PaintBucketIcon, label: 'Fill a region with a colour' },
  { id: 'eyedropper', icon: PipetteIcon, label: 'Pick a colour off the livery' },
] as const

const CREATORS = [
  { icon: ImagePlusIcon, label: 'Add image', run: addImageLayer },
  { icon: TypeIcon, label: 'Add text', run: addTextLayer },
  { icon: SquareIcon, label: 'Add rectangle', run: () => addShapeLayer('rect') },
  { icon: CircleIcon, label: 'Add ellipse', run: () => addShapeLayer('ellipse') },
]

/// These duplicate a stroke as it is drawn, and do nothing to an existing layer.
const paintsStrokes = computed(() => tool.value === 'brush' || tool.value === 'eraser')

const MIRRORS = [
  { icon: FlipHorizontal2Icon, state: mirrorX, label: 'Mirror strokes left to right' },
  { icon: FlipVertical2Icon, state: mirrorY, label: 'Mirror strokes top to bottom' },
]

defineExpose({
  TOOLS,
  CREATORS,
  MIRRORS,
  paintsStrokes,
  tool,
  brushSize,
  brushColor,
  fillColor,
  fillTolerance,
  setTool,
})
</script>

<template>
  <aside class="flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-muted/30 py-2">
    <button
      v-for="entry in TOOLS"
      :key="entry.id"
      type="button"
      class="flex size-10 cursor-pointer items-center justify-center rounded-md transition active:scale-90"
      :class="tool === entry.id ? 'bg-sky-500 text-white' : 'hover:bg-accent'"
      :title="entry.label"
      @click="setTool(entry.id)"
    >
      <component :is="entry.icon" class="size-4" />
    </button>

    <div v-if="paintsStrokes" class="my-1 h-px w-8 bg-border" />

    <button
      v-for="entry in paintsStrokes ? MIRRORS : []"
      :key="entry.label"
      type="button"
      class="flex size-10 cursor-pointer items-center justify-center rounded-md transition active:scale-90"
      :class="entry.state.value ? 'bg-sky-500 text-white' : 'hover:bg-accent'"
      :title="entry.label"
      @click="entry.state.value = !entry.state.value"
    >
      <component :is="entry.icon" class="size-4" />
    </button>

    <div class="my-1 h-px w-8 bg-border" />

    <button
      v-for="entry in CREATORS"
      :key="entry.label"
      type="button"
      class="flex size-10 cursor-pointer items-center justify-center rounded-md transition hover:bg-accent active:scale-90"
      :title="entry.label"
      @click="entry.run()"
    >
      <component :is="entry.icon" class="size-4" />
    </button>

    <div
      v-if="tool === 'brush' || tool === 'eraser'"
      class="mt-2 flex flex-col items-center gap-2 border-t pt-2"
    >
      <input
        v-model.number="brushSize"
        type="range"
        min="1"
        max="256"
        class="h-24 w-8"
        style="writing-mode: vertical-lr; direction: rtl"
        title="Brush size"
      />
      <span class="text-[10px] tabular-nums text-muted-foreground">{{ brushSize }}</span>
      <input
        v-if="tool === 'brush'"
        v-model="brushColor"
        type="color"
        class="size-7 cursor-pointer rounded border bg-transparent"
        title="Brush colour"
      />
    </div>

    <div v-if="tool === 'bucket'" class="mt-2 flex flex-col items-center gap-2 border-t pt-2">
      <input
        v-model.number="fillTolerance"
        type="range"
        min="0"
        max="255"
        class="h-24 w-8"
        style="writing-mode: vertical-lr; direction: rtl"
        title="How far a pixel's colour may differ from the one clicked"
      />
      <span class="text-[10px] tabular-nums text-muted-foreground">{{ fillTolerance }}</span>
      <input
        v-model="fillColor"
        type="color"
        class="size-7 cursor-pointer rounded border bg-transparent"
        title="Fill colour"
      />
    </div>
  </aside>
</template>
