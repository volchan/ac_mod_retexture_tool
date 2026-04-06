<script setup lang="ts">
import { open, save } from '@tauri-apps/plugin-dialog'
import { ImageIcon, RotateCcwIcon, UploadIcon } from 'lucide-vue-next'
import { reactive } from 'vue'
import { extractTrackHeroImage, getTrackHeroImage, previewReplacementImage } from '@/lib/tauri'
import type { Mod } from '@/types/index'

interface HeroImage {
  filename: string
  label: string
  aspectClass: string
  url: string | null
  replacementUrl: string | null
}

const props = defineProps<{
  mod: Mod
}>()

const heroImages = reactive<HeroImage[]>([
  {
    filename: 'preview.png',
    label: 'Loading screen',
    aspectClass: 'aspect-video',
    url: null,
    replacementUrl: null,
  },
  {
    filename: 'outline.png',
    label: 'Track outline',
    aspectClass: 'aspect-[3/1]',
    url: null,
    replacementUrl: null,
  },
])

async function loadImage(hero: HeroImage) {
  hero.url = await getTrackHeroImage(props.mod.path, hero.filename)
}

async function handleExtract(hero: HeroImage) {
  const outputPath = await save({
    defaultPath: hero.filename,
    filters: [{ name: 'PNG', extensions: ['png'] }],
  })
  if (!outputPath) return
  await extractTrackHeroImage(props.mod.path, hero.filename, outputPath)
}

async function handleReplace(hero: HeroImage) {
  const imagePath = await open({
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
    multiple: false,
  })
  if (!imagePath || Array.isArray(imagePath)) return
  hero.replacementUrl = await previewReplacementImage(imagePath)
}

function handleRevert(hero: HeroImage) {
  hero.replacementUrl = null
}

async function init() {
  await Promise.all(heroImages.map((h) => loadImage(h)))
}

init()

defineExpose({
  ImageIcon,
  RotateCcwIcon,
  UploadIcon,
  heroImages,
  handleExtract,
  handleReplace,
  handleRevert,
  loadImage,
})
</script>

<template>
  <div class="px-3 py-2">
    <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
      Key images
    </h3>
    <div class="grid grid-cols-2 gap-3">
      <div
        v-for="hero in heroImages"
        :key="hero.filename"
        class="border rounded-md overflow-hidden"
        :class="hero.replacementUrl ? 'border-2 border-amber-500' : 'border-border'"
      >
        <div class="checkerboard relative" :class="hero.aspectClass">
          <img
            v-if="hero.replacementUrl || hero.url"
            :src="(hero.replacementUrl || hero.url) as string"
            :alt="hero.label"
            class="w-full h-full object-contain"
          />
          <div v-else class="absolute inset-0 flex items-center justify-center">
            <ImageIcon :size="32" class="text-muted-foreground opacity-30" />
          </div>
          <div
            v-if="hero.replacementUrl"
            class="absolute top-1 right-1 bg-amber-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded"
          >
            Replaced
          </div>
        </div>
        <div class="px-2 py-1.5 bg-card">
          <p class="text-xs font-medium mb-1.5">{{ hero.label }}</p>
          <div class="flex gap-1.5">
            <button
              class="flex-1 flex items-center justify-center gap-1 text-[11px] px-2 py-1 rounded border hover:bg-accent transition-colors"
              @click="handleExtract(hero)"
            >
              Extract PNG
            </button>
            <button
              v-if="!hero.replacementUrl"
              class="flex-1 flex items-center justify-center gap-1 text-[11px] px-2 py-1 rounded border hover:bg-accent transition-colors"
              @click="handleReplace(hero)"
            >
              <UploadIcon :size="11" />
              Replace
            </button>
            <button
              v-else
              class="flex-1 flex items-center justify-center gap-1 text-[11px] px-2 py-1 rounded border border-amber-400 text-amber-600 hover:bg-amber-50 transition-colors"
              @click="handleRevert(hero)"
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
