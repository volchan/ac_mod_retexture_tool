<script setup lang="ts">
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  EyeOffIcon,
  ImageIcon,
  PaintBucketIcon,
  PencilIcon,
  SquareIcon,
  Trash2Icon,
  TypeIcon,
} from 'lucide-vue-next'
import { computed } from 'vue'
import LayerProperties from '@/components/editor/LayerProperties.vue'
import { Button } from '@/components/ui/button'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import type { EditorLayer } from '@/types/index'

const { layers, selectedId, selectedLayer, removeLayer, moveLayer, updateLayer, select } =
  useLiveryDocument()

const LAYER_ICONS = {
  image: ImageIcon,
  text: TypeIcon,
  shape: SquareIcon,
  bucket: PaintBucketIcon,
  strokes: PencilIcon,
}

// The stack renders bottom-up but reads top-down, the way every other editor shows it.
const stacked = computed(() => [...layers.value].reverse())

const opacityPercent = computed({
  get: () => Math.round((selectedLayer.value?.opacity ?? 1) * 100),
  set: (value: number) => {
    if (selectedLayer.value) updateLayer(selectedLayer.value.id, { opacity: value / 100 })
  },
})

function toggleVisible(layer: EditorLayer) {
  updateLayer(layer.id, { visible: !layer.visible })
}

defineExpose({
  Button,
  LayerProperties,
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  EyeOffIcon,
  Trash2Icon,
  LAYER_ICONS,
  stacked,
  selectedId,
  selectedLayer,
  opacityPercent,
  toggleVisible,
  removeLayer,
  moveLayer,
  select,
})
</script>

<template>
  <aside class="flex w-64 shrink-0 flex-col border-l bg-muted/30">
    <p class="border-b px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
      Layers
    </p>

    <p v-if="stacked.length === 0" class="p-3 text-xs text-muted-foreground">
      Nothing on top of the base texture yet.
    </p>

    <ul class="flex-1 min-h-0 overflow-y-auto">
      <li
        v-for="layer in stacked"
        :key="layer.id"
        class="flex items-center gap-1 border-b px-2 py-1.5 text-xs cursor-pointer"
        :class="layer.id === selectedId ? 'bg-accent' : 'hover:bg-accent/50'"
        @click="select(layer.id)"
      >
        <button
          type="button"
          class="cursor-pointer rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-90"
          :title="layer.visible ? 'Hide layer' : 'Show layer'"
          @click.stop="toggleVisible(layer)"
        >
          <EyeIcon v-if="layer.visible" class="size-3.5" />
          <EyeOffIcon v-else class="size-3.5" />
        </button>

        <component :is="LAYER_ICONS[layer.type]" class="size-3.5 shrink-0 text-muted-foreground" />
        <span class="flex-1 truncate" :class="{ 'opacity-40': !layer.visible }">
          {{ layer.name }}
        </span>

        <button
          type="button"
          class="cursor-pointer rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-90"
          title="Move up"
          @click.stop="moveLayer(layer.id, 1)"
        >
          <ChevronUpIcon class="size-3.5" />
        </button>
        <button
          type="button"
          class="cursor-pointer rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-90"
          title="Move down"
          @click.stop="moveLayer(layer.id, -1)"
        >
          <ChevronDownIcon class="size-3.5" />
        </button>
        <button
          type="button"
          class="cursor-pointer rounded p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive active:scale-90"
          title="Delete layer"
          @click.stop="removeLayer(layer.id)"
        >
          <Trash2Icon class="size-3.5" />
        </button>
      </li>
    </ul>

    <div v-if="selectedLayer" class="border-t p-3">
      <label class="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
        Opacity
        <span class="tabular-nums">{{ opacityPercent }}%</span>
      </label>
      <input v-model.number="opacityPercent" type="range" min="0" max="100" class="w-full" />
    </div>

    <LayerProperties />
  </aside>
</template>
