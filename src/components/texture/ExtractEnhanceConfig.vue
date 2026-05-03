<script setup lang="ts">
import { computed } from 'vue'
import type { EnhanceModel, EnhanceScale, Texture } from '@/types/index'

const MODELS: { id: EnhanceModel; label: string; description: string }[] = [
  {
    id: 'RealESRGAN_General_x4_v3',
    label: 'General',
    description:
      'Good all-rounder for photorealistic textures — road surfaces, car bodies, terrain.',
  },
  {
    id: 'realesr-animevideov3-x4',
    label: 'Anime',
    description:
      'Illustrated or synthetic textures — liveries with flat colors, logos, hard edges.',
  },
  {
    id: '4xLSDIRCompactC3',
    label: 'LSDIR Compact',
    description: 'Fast & sharp general-purpose alternative, often crisper than General.',
  },
  {
    id: '4xNomos8kSC',
    label: 'Nomos 8K',
    description: 'High quality, slower. Best for clean, low-noise textures.',
  },
  {
    id: '4x_NMKD-Siax_200k',
    label: 'NMKD Siax',
    description: 'Designed for compressed textures — good for heavily artifacted liveries.',
  },
]

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

const allSelected = computed(
  () => props.textures.length > 0 && props.selectedIds.size === props.textures.length,
)

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

const activeModel = computed(() => MODELS.find((m) => m.id === props.model))

defineExpose({ allSelected, toggleAll, toggleTexture, MODELS, activeModel })
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
      <div class="grid grid-cols-3 gap-1.5">
        <button
          v-for="m in MODELS"
          :key="m.id"
          class="text-[12px] py-1.5 rounded border transition-colors"
          :class="model === m.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'"
          @click="emit('update:model', m.id)"
        >
          {{ m.label }}
        </button>
      </div>
      <p class="text-[11px] text-muted-foreground mt-1.5">{{ activeModel?.description }}</p>
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
