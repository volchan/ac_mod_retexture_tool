<script setup lang="ts">
import { onMounted } from 'vue'
import TextureDetailImage from '@/components/texture/TextureDetailImage.vue'
import TextureDetailMeta from '@/components/texture/TextureDetailMeta.vue'
import { useTextureDetail } from '@/composables/useTextureDetail'
import type { Texture, TextureReplacement } from '@/types/index'

type ReplacementPayload = Omit<TextureReplacement, 'previewUrl'> & { previewUrl?: string }
type TexturePreviewPayload = Omit<Texture, 'previewUrl' | 'isDecoded' | 'replacement'> & {
  modPath?: string
  replacement?: ReplacementPayload
}

function toPreviewTexture(payload: Omit<TexturePreviewPayload, 'modPath'>): Texture {
  return {
    ...payload,
    replacement: payload.replacement
      ? { ...payload.replacement, previewUrl: payload.replacement.previewUrl ?? '' }
      : undefined,
    previewUrl: '',
    isDecoded: true,
  }
}

const { open, activeTexture } = useTextureDetail()

onMounted(() => {
  const raw = new URLSearchParams(window.location.search).get('data')
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as TexturePreviewPayload
    const { modPath: parsedModPath, ...texFields } = parsed
    const tex = toPreviewTexture(texFields)
    open(tex.id, [tex], parsedModPath)
  } catch {
    // malformed URL — viewer stays hidden
  }
})

defineExpose({ TextureDetailImage, TextureDetailMeta, activeTexture })
</script>

<template>
  <div class="flex h-screen bg-background text-foreground">
    <template v-if="activeTexture">
      <TextureDetailImage class="flex-1 min-w-0" />
      <TextureDetailMeta />
    </template>
  </div>
</template>
