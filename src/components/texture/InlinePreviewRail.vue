<script setup lang="ts">
import { DownloadIcon, UploadIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import type { Texture } from '@/types/index'

const props = defineProps<{
  texture: Texture | null
  modPath: string
}>()

const emit = defineEmits<{
  extract: [texture: Texture]
  replace: [texture: Texture]
}>()

const hasMismatch = computed(
  () =>
    props.texture?.replacement != null &&
    (props.texture.replacement.width !== props.texture.width ||
      props.texture.replacement.height !== props.texture.height),
)

defineExpose({
  DownloadIcon,
  UploadIcon,
  props,
  hasMismatch,
  emit,
})
</script>

<template>
  <div class="h-[240px] border-t bg-card flex shrink-0">
    <!-- No texture selected -->
    <div
      v-if="!texture"
      class="flex-1 flex items-center justify-center text-muted-foreground text-[12px]"
    >
      Click a texture to preview
    </div>

    <!-- Preview panels -->
    <template v-else>
      <!-- Side-by-side checker panels -->
      <div class="flex-1 flex gap-3 p-3 min-w-0">
        <!-- Original -->
        <div class="flex-1 checkerboard rounded-lg border border-border relative flex items-center justify-center overflow-hidden">
          <div class="absolute top-2 left-2 px-1.5 py-px text-[10.5px] font-semibold bg-card text-muted-foreground rounded border border-border">
            Original
          </div>
          <img
            v-if="texture.isDecoded && texture.previewUrl"
            :src="texture.previewUrl"
            :alt="texture.name"
            class="max-w-[85%] max-h-[85%] object-contain drop-shadow-md"
          />
          <div v-else class="text-muted-foreground text-[11px]">Loading…</div>
        </div>

        <!-- Replacement -->
        <div
          class="flex-1 checkerboard rounded-lg border relative flex items-center justify-center overflow-hidden"
          :class="texture.replacement ? 'border-primary' : 'border-border'"
        >
          <div
            class="absolute top-2 left-2 px-1.5 py-px text-[10.5px] font-semibold rounded"
            :class="
              texture.replacement
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground border border-border'
            "
          >
            {{ texture.replacement ? 'Replacement' : 'No replacement' }}
          </div>
          <span
            v-if="hasMismatch"
            class="absolute top-2 right-2 text-[9.5px] font-medium px-1.5 py-px rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
          >Size↕</span>
          <img
            v-if="texture.replacement"
            :src="texture.replacement.previewUrl"
            :alt="`${texture.name} replacement`"
            class="max-w-[85%] max-h-[85%] object-contain drop-shadow-md"
          />
          <div v-else class="text-muted-foreground text-[11px]">Drop a PNG to preview</div>
        </div>
      </div>

      <!-- Metadata sidebar -->
      <div class="w-[220px] shrink-0 border-l px-3.5 py-3.5 flex flex-col">
        <p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Selected Texture
        </p>
        <p class="text-[12.5px] font-semibold font-mono break-all mb-3 text-foreground leading-snug">
          {{ texture.name }}
        </p>
        <div class="space-y-1.5 text-[11px]">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Size</span>
            <span class="font-mono" :class="hasMismatch ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'">
              <template v-if="hasMismatch">{{ texture.width }}→{{ texture.replacement?.width }}</template>
              <template v-else>{{ texture.width }}×{{ texture.height }}</template>
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Format</span>
            <span class="font-mono text-foreground">{{ texture.format }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Category</span>
            <span class="font-mono text-foreground capitalize">{{ texture.category }}</span>
          </div>
        </div>
        <div class="flex-1" />
        <div class="space-y-1.5 mt-3">
          <button
            class="w-full flex items-center justify-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-[7px] border border-border hover:bg-muted transition-colors"
            @click="$emit('extract', texture)"
          >
            <DownloadIcon :size="12" />
            Extract
          </button>
          <button
            class="w-full flex items-center justify-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-[7px] border border-border hover:bg-muted transition-colors"
            @click="$emit('replace', texture)"
          >
            <UploadIcon :size="12" />
            Replace
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
