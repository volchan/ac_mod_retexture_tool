<script setup lang="ts">
import { open, save } from '@tauri-apps/plugin-dialog'
import { ImageIcon, RotateCcwIcon, UploadIcon } from 'lucide-vue-next'
import { onMounted, reactive } from 'vue'
import { extractTrackHeroImage, listTrackHeroImages, previewReplacementImage } from '@/lib/tauri'
import type { Mod, TrackLayoutHero } from '@/types/index'

interface HeroSlot extends TrackLayoutHero {
  aspectClass: string
  replacementUrl: string | null
}

const props = defineProps<{
  mod: Mod
}>()

const slots = reactive<HeroSlot[]>([])

async function loadImages() {
  const heroes = await listTrackHeroImages(props.mod.path)
  slots.splice(
    0,
    slots.length,
    ...heroes.map((h) => ({
      ...h,
      aspectClass: 'aspect-video',
      replacementUrl: null,
    })),
  )
}

async function handleExtract(slot: HeroSlot) {
  const outputPath = await save({
    defaultPath: 'preview.png',
    filters: [{ name: 'PNG', extensions: ['png'] }],
  })
  if (!outputPath) return
  await extractTrackHeroImage(props.mod.path, slot.filename, outputPath)
}

async function handleReplace(slot: HeroSlot) {
  const imagePath = await open({
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
    multiple: false,
  })
  if (!imagePath || Array.isArray(imagePath)) return
  slot.replacementUrl = await previewReplacementImage(imagePath)
}

function handleRevert(slot: HeroSlot) {
  slot.replacementUrl = null
}

onMounted(loadImages)

defineExpose({
  ImageIcon,
  RotateCcwIcon,
  UploadIcon,
  slots,
  handleExtract,
  handleReplace,
  handleRevert,
  loadImages,
})
</script>

<template>
  <div class="px-3 py-2">
    <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
      Key images
    </h3>
    <div class="grid grid-cols-2 gap-3">
      <div
        v-for="slot in slots"
        :key="slot.filename"
        class="border rounded-md overflow-hidden"
        :class="slot.replacementUrl ? 'border-2 border-amber-500' : 'border-border'"
      >
        <div class="checkerboard relative" :class="slot.aspectClass">
          <img
            v-if="slot.replacementUrl || slot.url"
            :src="(slot.replacementUrl || slot.url) as string"
            :alt="slot.label"
            class="w-full h-full object-contain"
          />
          <div v-else class="absolute inset-0 flex items-center justify-center">
            <ImageIcon :size="32" class="text-muted-foreground opacity-30" />
          </div>
          <div
            v-if="slot.replacementUrl"
            class="absolute top-1 right-1 bg-amber-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded"
          >
            Replaced
          </div>
        </div>
        <div class="px-2 py-1.5 bg-card">
          <p class="text-xs font-medium mb-1.5">{{ slot.label }}</p>
          <div class="flex gap-1.5">
            <button
              class="flex-1 flex items-center justify-center gap-1 text-[11px] px-2 py-1 rounded border hover:bg-accent transition-colors"
              @click="handleExtract(slot)"
            >
              Extract PNG
            </button>
            <button
              v-if="!slot.replacementUrl"
              class="flex-1 flex items-center justify-center gap-1 text-[11px] px-2 py-1 rounded border hover:bg-accent transition-colors"
              @click="handleReplace(slot)"
            >
              <UploadIcon :size="11" />
              Replace
            </button>
            <button
              v-else
              class="flex-1 flex items-center justify-center gap-1 text-[11px] px-2 py-1 rounded border border-amber-400 text-amber-600 hover:bg-amber-50 transition-colors"
              @click="handleRevert(slot)"
            >
              <RotateCcwIcon :size="11" />
              Revert
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
