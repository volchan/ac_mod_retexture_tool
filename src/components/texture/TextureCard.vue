<script setup lang="ts">
import { CheckIcon, Loader2Icon, ZoomInIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { previewLabel } from '@/lib/utils'
import type { Texture, TextureDensity } from '@/types/index'

const props = defineProps<{
  texture: Texture
  isSelected: boolean
  density?: TextureDensity
}>()

const emit = defineEmits<{
  'toggle-select': []
  'open-detail': []
}>()

const hasMismatch = computed(
  () =>
    props.texture.replacement != null &&
    (props.texture.replacement.width !== props.texture.width ||
      props.texture.replacement.height !== props.texture.height),
)

const imgHeight = computed(() => {
  switch (props.density) {
    case 'sm':
      return 'h-[76px]'
    case 'lg':
      return 'h-[152px]'
    default:
      return 'h-[112px]'
  }
})

const nameSize = computed(() => {
  switch (props.density) {
    case 'sm':
      return 'text-[10.5px]'
    case 'lg':
      return 'text-[12px]'
    default:
      return 'text-[11.5px]'
  }
})

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
  hasMismatch,
  imgHeight,
  nameSize,
  handleToggleSelect,
  handleOpenDetail,
  previewLabel,
})
</script>

<template>
  <div
    class="relative cursor-pointer rounded-[8px] overflow-hidden bg-card border transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    role="button"
    tabindex="0"
    :aria-pressed="props.isSelected"
    :class="[
      props.isSelected
        ? 'border-primary shadow-[0_0_0_1px_var(--color-primary)]'
        : hasMismatch
          ? 'border-amber-400'
          : props.texture.replacement
            ? 'border-[var(--accent-border)]'
            : 'border-border hover:border-border/80',
    ]"
    @click="handleToggleSelect"
    @keydown.enter="handleToggleSelect"
    @keydown.space.prevent="handleToggleSelect"
  >
    <!-- Selected checkmark -->
    <div
      v-if="props.isSelected"
      class="absolute top-1.5 left-1.5 w-4 h-4 rounded-[4px] bg-primary flex items-center justify-center z-10"
    >
      <CheckIcon :size="10" class="text-primary-foreground" stroke-width="3" />
    </div>

    <!-- Replacement / mismatch badge -->
    <div
      v-if="props.texture.replacement"
      class="absolute top-1.5 right-1.5 z-10 text-[9.5px] font-medium px-1.5 py-px rounded-[3px]"
      :class="
        hasMismatch
          ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
          : 'bg-[var(--accent-muted)] text-[var(--accent-text)] border border-[var(--accent-border)]'
      "
    >
      {{ hasMismatch ? 'Size↕' : 'Replaced' }}
    </div>

    <!-- Thumbnail -->
    <div class="checkerboard w-full relative group" :class="imgHeight">
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
      <button
        type="button"
        class="absolute bottom-1 right-1 bg-black/40 hover:bg-black/70 rounded p-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        title="View full size"
        aria-label="View full size"
        @click="handleOpenDetail"
      >
        <ZoomInIcon :size="14" class="text-white" />
      </button>
    </div>

    <!-- Info footer -->
    <div class="px-2 py-1.5 border-t border-border">
      <p class="font-medium truncate" :class="nameSize" :title="props.texture.name">
        {{ props.texture.category === 'preview' ? previewLabel(props.texture.name) : props.texture.name }}
      </p>
      <p class="text-[10px] text-muted-foreground font-mono mt-0.5">
        <span :class="hasMismatch ? 'text-amber-600 dark:text-amber-400' : ''">
          <template v-if="hasMismatch">
            {{ props.texture.width }}×{{ props.texture.height }}→{{ props.texture.replacement?.width }}×{{ props.texture.replacement?.height }}
          </template>
          <template v-else-if="props.texture.replacement">
            {{ props.texture.replacement.width }}×{{ props.texture.replacement.height }}
          </template>
          <template v-else>{{ props.texture.width }}×{{ props.texture.height }}</template>
        </span>
        · {{ props.texture.format }}
      </p>
    </div>
  </div>
</template>
