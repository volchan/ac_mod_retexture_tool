<script setup lang="ts">
import { FlipHorizontal2Icon, FlipVertical2Icon } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import { useSystemFonts } from '@/composables/useSystemFonts'
import type { BlendMode, BucketLayer, ShapeLayer, TextLayer } from '@/types/index'

const { selectedLayer, updateLayer } = useLiveryDocument()

const BLEND_MODES: BlendMode[] = ['source-over', 'multiply', 'screen', 'overlay']

const { fonts, load: loadFonts } = useSystemFonts()
onMounted(loadFonts)

const text = computed(() => (selectedLayer.value?.type === 'text' ? selectedLayer.value : null))
const fill = computed(() => (selectedLayer.value?.type === 'bucket' ? selectedLayer.value : null))
const shape = computed(() => (selectedLayer.value?.type === 'shape' ? selectedLayer.value : null))

const placed = computed(() => {
  const layer = selectedLayer.value
  if (layer?.type === 'image' || layer?.type === 'text' || layer?.type === 'shape') return layer
  return null
})

function mirror(axis: 'x' | 'y') {
  const layer = placed.value
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

function patchShape(patch: Partial<ShapeLayer>) {
  if (shape.value) updateLayer(shape.value.id, patch)
}

defineExpose({
  BLEND_MODES,
  fonts,
  Button,
  FlipHorizontal2Icon,
  FlipVertical2Icon,
  text,
  fill,
  shape,
  placed,
  mirror,
  patchText,
  patchFill,
  patchShape,
})
</script>

<template>
  <div v-if="placed || fill" class="space-y-2 border-t p-3 text-xs">
    <div v-if="placed" class="flex items-center gap-2">
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
      <select
        :value="text.fontFamily"
        class="w-full rounded border bg-background px-2 py-1"
        title="Font"
        @change="patchText({ fontFamily: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="font in fonts" :key="font" :value="font" :style="{ fontFamily: font }">
          {{ font }}
        </option>
      </select>
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
      <div class="flex items-center gap-2">
        <input
          :value="text.curve"
          type="range"
          min="-180"
          max="180"
          class="flex-1"
          title="Bend the baseline, so a name follows a curved panel"
          @input="patchText({ curve: Number(($event.target as HTMLInputElement).value) })"
        />
        <span class="w-10 text-right tabular-nums text-muted-foreground">{{ text.curve }}°</span>
      </div>
    </template>

    <template v-if="shape">
      <div class="flex items-center gap-2">
        <input
          :value="shape.fill"
          type="color"
          class="size-7 cursor-pointer rounded border bg-transparent"
          title="Fill colour"
          @input="patchShape({ fill: ($event.target as HTMLInputElement).value })"
        />
        <input
          :value="shape.stroke"
          type="color"
          class="size-7 cursor-pointer rounded border bg-transparent"
          title="Outline colour"
          @input="patchShape({ stroke: ($event.target as HTMLInputElement).value })"
        />
        <input
          :value="shape.strokeWidth"
          type="number"
          min="0"
          class="w-16 rounded border bg-background px-2 py-1"
          title="Outline width"
          @input="patchShape({ strokeWidth: Number(($event.target as HTMLInputElement).value) })"
        />
      </div>
      <div v-if="shape.shape === 'rect'" class="flex items-center gap-2">
        <input
          :value="shape.cornerRadius"
          type="range"
          min="0"
          max="200"
          class="flex-1"
          title="Corner radius"
          @input="patchShape({ cornerRadius: Number(($event.target as HTMLInputElement).value) })"
        />
        <span class="w-10 text-right tabular-nums text-muted-foreground">
          {{ shape.cornerRadius }}
        </span>
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
