<script setup lang="ts">
import { FlipHorizontal2Icon, FlipVertical2Icon } from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import type { BlendMode, BucketLayer, TextLayer } from '@/types/index'

const { selectedLayer, updateLayer } = useLiveryDocument()

const BLEND_MODES: BlendMode[] = ['source-over', 'multiply', 'screen', 'overlay']

const text = computed(() => (selectedLayer.value?.type === 'text' ? selectedLayer.value : null))
const fill = computed(() => (selectedLayer.value?.type === 'bucket' ? selectedLayer.value : null))
const image = computed(() => (selectedLayer.value?.type === 'image' ? selectedLayer.value : null))

/// Mirroring is a negative scale, so flipping twice returns the original sticker
/// whatever scale the transformer left it at.
function mirror(axis: 'x' | 'y') {
  const layer = image.value
  if (!layer) return
  if (axis === 'x') updateLayer(layer.id, { scaleX: -layer.scaleX })
  else updateLayer(layer.id, { scaleY: -layer.scaleY })
}

function patchText(patch: Partial<TextLayer>) {
  if (text.value) updateLayer(text.value.id, patch)
}

function patchFill(patch: Partial<BucketLayer>) {
  if (fill.value) updateLayer(fill.value.id, patch)
}

defineExpose({
  BLEND_MODES,
  Button,
  FlipHorizontal2Icon,
  FlipVertical2Icon,
  text,
  fill,
  image,
  mirror,
  patchText,
  patchFill,
})
</script>

<template>
  <div v-if="text || fill || image" class="space-y-2 border-t p-3 text-xs">
    <div v-if="image" class="flex items-center gap-2">
      <Button variant="outline" size="sm" class="flex-1" @click="mirror('x')">
        <FlipHorizontal2Icon class="size-3.5" />
        Mirror
      </Button>
      <Button variant="outline" size="sm" class="flex-1" @click="mirror('y')">
        <FlipVertical2Icon class="size-3.5" />
        Flip
      </Button>
    </div>

    <template v-if="text">
      <input
        :value="text.value"
        class="w-full rounded border bg-background px-2 py-1"
        placeholder="Text"
        @input="patchText({ value: ($event.target as HTMLInputElement).value })"
      />
      <div class="flex items-center gap-2">
        <input
          :value="text.fontSize"
          type="number"
          min="4"
          class="w-16 rounded border bg-background px-2 py-1"
          title="Font size"
          @input="patchText({ fontSize: Number(($event.target as HTMLInputElement).value) })"
        />
        <input
          :value="text.fill"
          type="color"
          class="size-7 cursor-pointer rounded border bg-transparent"
          title="Fill colour"
          @input="patchText({ fill: ($event.target as HTMLInputElement).value })"
        />
        <input
          :value="text.stroke"
          type="color"
          class="size-7 cursor-pointer rounded border bg-transparent"
          title="Outline colour"
          @input="patchText({ stroke: ($event.target as HTMLInputElement).value })"
        />
        <input
          :value="text.strokeWidth"
          type="number"
          min="0"
          class="w-16 rounded border bg-background px-2 py-1"
          title="Outline width"
          @input="patchText({ strokeWidth: Number(($event.target as HTMLInputElement).value) })"
        />
      </div>
    </template>

    <template v-if="fill">
      <div class="flex items-center gap-2">
        <input
          :value="fill.color"
          type="color"
          class="size-7 cursor-pointer rounded border bg-transparent"
          title="Fill colour"
          @input="patchFill({ color: ($event.target as HTMLInputElement).value })"
        />
        <select
          :value="fill.blend"
          class="flex-1 rounded border bg-background px-2 py-1"
          title="Blend mode"
          @change="patchFill({ blend: ($event.target as HTMLSelectElement).value as BlendMode })"
        >
          <option v-for="mode in BLEND_MODES" :key="mode" :value="mode">{{ mode }}</option>
        </select>
      </div>

      <div class="flex items-center gap-2">
        <input
          :value="fill.tolerance"
          type="range"
          min="0"
          max="255"
          class="flex-1"
          title="How far a pixel's colour may differ from the one clicked"
          @input="patchFill({ tolerance: Number(($event.target as HTMLInputElement).value) })"
        />
        <span class="w-8 text-right tabular-nums text-muted-foreground">{{ fill.tolerance }}</span>
      </div>
    </template>
  </div>
</template>
