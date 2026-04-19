<script setup lang="ts">
import { onMounted } from 'vue'
import TextureDetailImage from '@/components/texture/TextureDetailImage.vue'
import TextureDetailMeta from '@/components/texture/TextureDetailMeta.vue'
import { useTextureDetail } from '@/composables/useTextureDetail'
import type { Texture } from '@/types/index'

const { open } = useTextureDetail()

onMounted(() => {
  const raw = new URLSearchParams(window.location.search).get('data')
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as Omit<Texture, 'previewUrl' | 'isDecoded'> & {
      modPath?: string
    }
    const { modPath: parsedModPath, ...texFields } = parsed
    const tex: Texture = { ...texFields, previewUrl: '', isDecoded: true }
    open(tex.id, [tex], parsedModPath)
  } catch {
    // malformed URL — window shows nothing
  }
})

defineExpose({ TextureDetailImage, TextureDetailMeta })
</script>

<template>
  <div class="flex h-screen bg-background text-foreground">
    <TextureDetailImage class="flex-1 min-w-0" />
    <TextureDetailMeta />
  </div>
</template>
