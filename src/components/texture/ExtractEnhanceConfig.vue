<script setup lang="ts">
import { computed } from 'vue'
import type { EnhanceModel, EnhanceScale, Texture } from '@/types/index'

const props = defineProps<{
  textures: Texture[]
  scale: EnhanceScale
  model: EnhanceModel
  selectedIds: Set<string>
}>()

const emit = defineEmits<{
  'update:scale': [value: EnhanceScale]
  'update:model': [value: EnhanceModel]
  'update:selectedIds': [value: Set<string>]
}>()

const allSelected = computed(() => props.selectedIds.size === props.textures.length)

function toggleAll() {
  emit(
    'update:selectedIds',
    allSelected.value ? new Set() : new Set(props.textures.map((t) => t.id)),
  )
}

function toggleTexture(id: string) {
  const next = new Set(props.selectedIds)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  emit('update:selectedIds', next)
}

defineExpose({ allSelected, toggleAll, toggleTexture })
</script>

<template>
  <div class="space-y-3">
    <div>
      <label class="block text-[11px] text-muted-foreground mb-1.5">Scale factor</label>
      <div class="flex gap-2">
        <button
          v-for="s in [2, 4]"
          :key="s"
          class="flex-1 text-sm py-1.5 rounded border transition-colors"
          :class="scale === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'"
          @click="emit('update:scale', s as EnhanceScale)"
        >
          {{ s }}×
        </button>
      </div>
    </div>

    <div>
      <label class="block text-[11px] text-muted-foreground mb-1.5">Model</label>
      <div class="flex gap-2">
        <button
          class="flex-1 text-sm py-1.5 rounded border transition-colors"
          :class="model === 'RealESRGAN_General_x4_v3' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'"
          @click="emit('update:model', 'RealESRGAN_General_x4_v3')"
        >
          Photo
        </button>
        <button
          class="flex-1 text-sm py-1.5 rounded border transition-colors"
          :class="model === 'realesr-animevideov3-x4' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'"
          @click="emit('update:model', 'realesr-animevideov3-x4')"
        >
          Anime
        </button>
      </div>
      <p class="text-[11px] text-muted-foreground mt-1.5">
        <template v-if="model === 'RealESRGAN_General_x4_v3'">
          Best for photorealistic textures — road surfaces, car bodies, terrain, and scanned materials.
        </template>
        <template v-else>
          Best for illustrated or synthetic textures — liveries with flat colors, logos, hard edges, and hand-drawn art.
        </template>
      </p>
    </div>

    <div>
      <div class="flex items-center justify-between mb-1.5">
        <label class="text-[11px] text-muted-foreground">
          Textures to enhance
          <span class="ml-1">({{ selectedIds.size }}/{{ textures.length }})</span>
        </label>
        <button
          class="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          @click="toggleAll"
        >
          {{ allSelected ? 'Deselect all' : 'Select all' }}
        </button>
      </div>
      <div class="border rounded overflow-y-auto max-h-36 bg-muted/30">
        <label
          v-for="tex in textures"
          :key="tex.id"
          class="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-accent/50 transition-colors"
        >
          <input
            type="checkbox"
            :checked="selectedIds.has(tex.id)"
            class="shrink-0 accent-primary"
            @change="toggleTexture(tex.id)"
          />
          <span class="text-xs font-mono truncate flex-1">{{ tex.name }}</span>
          <span class="text-[11px] text-muted-foreground shrink-0">{{ tex.width }}×{{ tex.height }}</span>
        </label>
      </div>
    </div>
  </div>
</template>
