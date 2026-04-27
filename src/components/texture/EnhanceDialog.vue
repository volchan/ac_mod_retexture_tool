<script setup lang="ts">
import { SparklesIcon } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { enhanceTexture } from '@/lib/tauri'
import type {
  EnhanceModel,
  EnhanceResult,
  EnhanceScale,
  MatchedTexture,
  Texture,
} from '@/types/index'

const props = defineProps<{
  isOpen: boolean
  textures: Texture[]
  modPath: string
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
  apply: [results: MatchedTexture[]]
}>()

const scale = ref<EnhanceScale>(4)
const model = ref<EnhanceModel>('RealESRGAN_General_x4_v3')
const isEnhancing = ref(false)
const currentLabel = ref('')
const currentIndex = ref(0)
const errors = ref<string[]>([])
const done = ref(false)

const dialogOpen = computed({
  get: () => props.isOpen,
  set: (val) => emit('update:isOpen', val),
})

const progressPercent = computed(() =>
  props.textures.length > 0 ? (currentIndex.value / props.textures.length) * 100 : 0,
)

async function handleEnhance() {
  if (props.textures.length === 0) return
  isEnhancing.value = true
  currentIndex.value = 0
  errors.value = []
  const results: MatchedTexture[] = []

  for (const tex of props.textures) {
    currentLabel.value = tex.name
    try {
      const result: EnhanceResult = await enhanceTexture(tex, props.modPath, {
        scale: scale.value,
        model: model.value,
      })
      results.push({
        texture: tex,
        sourcePath: result.outputPath,
        previewUrl: result.previewUrl,
        sourceWidth: result.width,
        sourceHeight: result.height,
        hasDimensionMismatch: false,
      })
    } catch (e) {
      errors.value = [...errors.value, `${tex.name}: ${e instanceof Error ? e.message : String(e)}`]
    }
    currentIndex.value++
  }

  isEnhancing.value = false
  done.value = true
  if (results.length > 0) emit('apply', results)
}

function handleClose() {
  if (isEnhancing.value) return
  done.value = false
  errors.value = []
  currentIndex.value = 0
  currentLabel.value = ''
  dialogOpen.value = false
}

function preventInteractOutside(e: Event) {
  if (isEnhancing.value) e.preventDefault()
}

watch(dialogOpen, (val) => {
  if (!val) {
    done.value = false
    errors.value = []
    currentIndex.value = 0
    currentLabel.value = ''
  }
})

defineExpose({
  SparklesIcon,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
  scale,
  model,
  isEnhancing,
  currentLabel,
  currentIndex,
  errors,
  done,
  dialogOpen,
  progressPercent,
  handleEnhance,
  handleClose,
  preventInteractOutside,
})
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent
      class="max-w-md"
      :show-close-button="false"
      @interact-outside="preventInteractOutside"
    >
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <SparklesIcon :size="16" />
          Enhance {{ textures.length }} texture{{ textures.length !== 1 ? 's' : '' }}
        </DialogTitle>
        <DialogDescription class="sr-only">
          AI upscale then downscale to original dimensions for improved detail.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <div v-if="!isEnhancing && !done" class="space-y-3">
          <div>
            <label class="block text-[11px] text-muted-foreground mb-1.5">Scale factor</label>
            <div class="flex gap-2">
              <button
                v-for="s in [2, 4]"
                :key="s"
                class="flex-1 text-sm py-1.5 rounded border transition-colors"
                :class="scale === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'"
                @click="scale = s as EnhanceScale"
              >
                {{ s }}×
              </button>
            </div>
          </div>

          <div>
            <label class="block text-[11px] text-muted-foreground mb-1.5">Model</label>
            <div class="flex gap-2">
              <button
                class="flex-1 text-sm py-1.5 rounded border transition-colors"
                :class="model === 'RealESRGAN_General_x4_v3' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'"
                @click="model = 'RealESRGAN_General_x4_v3'"
              >
                Photo
              </button>
              <button
                class="flex-1 text-sm py-1.5 rounded border transition-colors"
                :class="model === 'realesr-animevideov3-x4' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'"
                @click="model = 'realesr-animevideov3-x4'"
              >
                Anime
              </button>
            </div>
            <p class="text-[11px] text-muted-foreground mt-1.5">
              <template v-if="model === 'RealESRGAN_General_x4_v3'">
                Best for photorealistic textures — road surfaces, car bodies, terrain, and scanned materials.
              </template>
              <template v-else>
                Best for illustrated or synthetic textures — liveries with flat colors, logos, hard edges, and hand-drawn art.
              </template>
            </p>
          </div>

          <p class="text-[11px] text-muted-foreground">
            Upscales {{ scale }}× with AI then downscales back — dimensions unchanged, detail improved.
          </p>
        </div>

        <div v-if="isEnhancing || (done && textures.length > 0)">
          <div class="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span class="truncate">{{ isEnhancing ? (currentLabel || 'Enhancing…') : 'Done' }}</span>
            <span class="shrink-0 ml-2">{{ currentIndex }}/{{ textures.length }}</span>
          </div>
          <Progress :model-value="progressPercent" class="h-1.5" />
        </div>

        <div v-if="done && errors.length === 0 && !isEnhancing" class="text-xs text-green-600">
          Enhanced {{ currentIndex }} texture{{ currentIndex !== 1 ? 's' : '' }} successfully.
        </div>

        <div v-if="errors.length > 0" class="space-y-1">
          <p class="text-xs text-amber-600">{{ errors.length }} error{{ errors.length !== 1 ? 's' : '' }}:</p>
          <p
            v-for="err in errors"
            :key="err"
            class="text-[11px] font-mono text-destructive truncate"
          >
            {{ err }}
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" :disabled="isEnhancing" @click="handleClose">
          {{ done ? 'Close' : 'Cancel' }}
        </Button>
        <Button v-if="!done" size="sm" :disabled="isEnhancing || textures.length === 0" @click="handleEnhance">
          <SparklesIcon :size="13" class="mr-1.5" />
          Enhance
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
