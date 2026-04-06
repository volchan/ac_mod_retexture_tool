<script setup lang="ts">
import { CheckIcon, Loader2Icon } from 'lucide-vue-next'
import type { Texture } from '@/types/index'

const props = defineProps<{
  texture: Texture
  isSelected: boolean
}>()

const emit = defineEmits<{
  'toggle-select': []
}>()

function handleClick() {
  emit('toggle-select')
}

defineExpose({ CheckIcon, Loader2Icon, props, handleClick })
</script>

<template>
  <div
    class="relative cursor-pointer rounded-md overflow-hidden transition-all"
    :class="[
      props.isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-border',
      props.texture.replacement ? 'ring-2 ring-amber-500' : '',
    ]"
    @click="handleClick"
  >
    <div class="checkerboard w-full aspect-square relative">
      <img
        v-if="props.texture.isDecoded && props.texture.previewUrl"
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
      <div
        v-if="props.texture.replacement"
        class="absolute top-1 right-1 bg-amber-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded"
      >
        Replaced
      </div>
    </div>
    <div class="px-1.5 py-1 bg-card">
      <p class="text-[11px] font-medium truncate" :title="props.texture.name">
        {{ props.texture.name }}
      </p>
      <p class="text-[10px] text-muted-foreground">
        {{ props.texture.width }}×{{ props.texture.height }} · {{ props.texture.format }}
      </p>
    </div>
  </div>
</template>
