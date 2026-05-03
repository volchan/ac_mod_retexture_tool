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
import Spinner from '@/components/ui/spinner/Spinner.vue'
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

const MODELS: { id: EnhanceModel; label: string; description: string }[] = [
  {
    id: 'RealESRGAN_General_x4_v3',
    label: 'General',
    description:
      'Good all-rounder for photorealistic textures — road surfaces, car bodies, terrain.',
  },
  {
    id: 'realesr-animevideov3-x4',
    label: 'Anime',
    description:
      'Illustrated or synthetic textures — liveries with flat colors, logos, hard edges.',
  },
  {
    id: '4xLSDIRCompactC3',
    label: 'LSDIR Compact',
    description: 'Fast & sharp general-purpose alternative, often crisper than General.',
  },
  {
    id: '4xNomos8kSC',
    label: 'Nomos 8K',
    description: 'High quality, slower. Best for clean, low-noise textures.',
  },
  {
    id: '4x_NMKD-Siax_200k',
    label: 'NMKD Siax',
    description: 'Designed for compressed textures — good for heavily artifacted liveries.',
  },
]

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

const successCount = computed(() => currentIndex.value - errors.value.length)

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
  MODELS,
  SparklesIcon,
  Spinner,
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
  successCount,
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
            <div class="grid grid-cols-3 gap-1.5">
              <button
                v-for="m in MODELS"
                :key="m.id"
                class="text-[12px] py-1.5 rounded border transition-colors"
                :class="model === m.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'"
                @click="model = m.id"
              >
                {{ m.label }}
              </button>
            </div>
            <p class="text-[11px] text-muted-foreground mt-1.5">
              {{ MODELS.find((m) => m.id === model)?.description }}
            </p>
          </div>

          <p class="text-[11px] text-muted-foreground">
            Upscales {{ scale }}× with AI then downscales back — dimensions unchanged, detail improved.
          </p>
        </div>

        <div v-if="isEnhancing || (done && textures.length > 0)">
          <div class="flex items-center justify-between text-xs mb-1">
            <div class="flex items-center gap-1.5 text-muted-foreground min-w-0">
              <Spinner v-if="isEnhancing" :size="11" />
              <span class="truncate font-mono">{{ isEnhancing ? (currentLabel || 'Enhancing…') : 'Done' }}</span>
            </div>
            <span class="shrink-0 ml-2 text-foreground font-medium">{{ currentIndex }}/{{ textures.length }}</span>
          </div>
          <Progress :model-value="progressPercent" class="h-1.5" />
        </div>

        <div v-if="done && successCount > 0 && !isEnhancing" class="text-xs text-green-600">
          Enhanced {{ successCount }} texture{{ successCount !== 1 ? 's' : '' }} successfully.
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
