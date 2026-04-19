<script setup lang="ts">
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-vue-next'
import { onMounted, onUnmounted } from 'vue'
import TextureDetailImage from '@/components/texture/TextureDetailImage.vue'
import TextureDetailMeta from '@/components/texture/TextureDetailMeta.vue'
import { useTextureDetail } from '@/composables/useTextureDetail'

const { activeTexture, hasPrev, hasNext, close, navigate } = useTextureDetail()

function handleKey(e: KeyboardEvent) {
  if (!activeTexture.value) return
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowLeft') navigate('prev')
  else if (e.key === 'ArrowRight') navigate('next')
}

onMounted(() => window.addEventListener('keydown', handleKey))
onUnmounted(() => window.removeEventListener('keydown', handleKey))

defineExpose({
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  TextureDetailImage,
  TextureDetailMeta,
  activeTexture,
  hasPrev,
  hasNext,
  close,
  navigate,
  handleKey,
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="activeTexture"
      role="dialog"
      aria-modal="true"
      :aria-label="activeTexture?.name ?? 'Texture details'"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      @click.self="close"
    >
      <div
        class="relative flex w-[90vw] max-w-6xl h-[85vh] rounded-lg border bg-card shadow-xl overflow-hidden"
      >
        <button
          type="button"
          class="absolute top-2 right-2 z-10 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close"
          @click="close"
        >
          <XIcon :size="18" />
        </button>

        <button
          v-if="hasPrev"
          type="button"
          class="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-colors"
          aria-label="Previous texture"
          @click="navigate('prev')"
        >
          <ChevronLeftIcon :size="20" />
        </button>

        <button
          v-if="hasNext"
          type="button"
          class="absolute right-[calc(18rem+0.5rem)] top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-colors"
          aria-label="Next texture"
          @click="navigate('next')"
        >
          <ChevronRightIcon :size="20" />
        </button>

        <TextureDetailImage class="flex-1 min-w-0" />
        <TextureDetailMeta />
      </div>
    </div>
  </Teleport>
</template>
