<script setup lang="ts">
import { CheckIcon, Loader2Icon, ZoomInIcon } from 'lucide-vue-next'
import { previewLabel } from '@/lib/utils'
import type { Texture } from '@/types/index'

const props = defineProps<{
  texture: Texture
  isSelected: boolean
}>()

const emit = defineEmits<{
  'toggle-select': []
  'open-detail': []
}>()

function handleToggleSelect() {
  emit('toggle-select')
}

function handleOpenDetail(e: MouseEvent) {
  e.stopPropagation()
  emit('open-detail')
}

defineExpose({
  CheckIcon,
  Loader2Icon,
  ZoomInIcon,
  props,
  handleToggleSelect,
  handleOpenDetail,
  previewLabel,
})
</script>

<template>
  <div
    class="relative cursor-pointer rounded-md overflow-hidden transition-all"
    :class="[
      props.isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-border',
      props.texture.replacement ? 'ring-2 ring-amber-500' : '',
    ]"
    @click="handleToggleSelect"
  >
    <div class="checkerboard w-full relative aspect-square group">
      <img
        v-if="props.texture.replacement"
        :src="props.texture.replacement.previewUrl"
        :alt="props.texture.name"
        class="w-full h-full object-contain"
      />
      <img
        v-else-if="props.texture.isDecoded && props.texture.previewUrl"
        :src="props.texture.previewUrl"
        :alt="props.texture.name"
        class="w-full h-full object-contain"
      />
      <div
        v-if="!props.texture.isDecoded"
        class="absolute inset-0 flex items-center justify-center bg-black/20"
      >
        <Loader2Icon class="animate-spin text-white" :size="24" />
      </div>
      <div
        v-if="props.isSelected"
        class="absolute top-1 left-1 bg-blue-500 rounded-full p-0.5"
      >
        <CheckIcon :size="12" class="text-white" />
      </div>
      <button
        class="absolute bottom-1 right-1 bg-black/40 hover:bg-black/70 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        title="View full size"
        @click="handleOpenDetail"
      >
        <ZoomInIcon :size="14" class="text-white" />
      </button>
      <div
        v-if="props.texture.replacement"
        class="absolute top-1 right-1 bg-amber-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded"
      >
        Replaced
      </div>
    </div>
    <div class="px-1.5 py-1 bg-card">
      <p class="text-[11px] font-medium truncate" :title="props.texture.name">
        {{ props.texture.category === 'preview' ? previewLabel(props.texture.name) : props.texture.name }}
      </p>
      <p class="text-[10px] text-muted-foreground">
        <template v-if="props.texture.replacement">
          {{ props.texture.replacement.width }}×{{ props.texture.replacement.height }}
        </template>
        <template v-else>{{ props.texture.width }}×{{ props.texture.height }}</template>
        · {{ props.texture.format }}
      </p>
    </div>
  </div>
</template>
