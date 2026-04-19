<script setup lang="ts">
import { AlertCircleIcon } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import TextureDetailImage from '@/components/texture/TextureDetailImage.vue'
import TextureDetailMeta from '@/components/texture/TextureDetailMeta.vue'
import { useTextureDetail } from '@/composables/useTextureDetail'
import { isValidPayload, toPreviewTexture } from '@/lib/previewPayload'

const { open, activeTexture } = useTextureDetail()
const parseError = ref<string | null>(null)

onMounted(() => {
  const raw = new URLSearchParams(window.location.search).get('data')
  if (!raw) {
    parseError.value = 'Missing texture data'
    return
  }
  try {
    const parsed = JSON.parse(raw)
    if (!isValidPayload(parsed)) {
      parseError.value = 'Invalid texture payload'
      return
    }
    const { modPath: parsedModPath, ...texFields } = parsed
    const tex = toPreviewTexture(texFields)
    open(tex.id, [tex], parsedModPath)
  } catch {
    parseError.value = 'Malformed texture data'
  }
})

defineExpose({
  AlertCircleIcon,
  TextureDetailImage,
  TextureDetailMeta,
  activeTexture,
  parseError,
  isValidPayload,
})
</script>

<template>
  <div class="flex h-screen bg-background text-foreground">
    <template v-if="activeTexture">
      <TextureDetailImage class="flex-1 min-w-0" />
      <TextureDetailMeta />
    </template>
    <div
      v-else-if="parseError"
      class="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground"
    >
      <AlertCircleIcon :size="32" class="text-destructive" />
      <p class="text-sm">{{ parseError }}</p>
    </div>
  </div>
</template>
