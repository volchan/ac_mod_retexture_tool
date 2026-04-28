<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import { FileImageIcon, FolderIcon, FolderOpenIcon, SparklesIcon } from 'lucide-vue-next'
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
import { useCancelConfirm } from '@/composables/useCancelConfirm'
import {
  enhanceExtractedTextures,
  extractTextures,
  onEnhanceProgress,
  onExtractProgress,
} from '@/lib/tauri'
import type { EnhanceModel, EnhanceScale, ProgressInfo, Texture } from '@/types/index'
import ExtractEnhanceConfig from './ExtractEnhanceConfig.vue'

interface TreeFolder {
  name: string
  files: string[]
}

const props = defineProps<{
  isOpen: boolean
  textures: Texture[]
  modPath: string
  modName: string
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
  done: []
}>()

const outputDir = ref('')
const isExtracting = ref(false)
const isEnhancing = ref(false)
const progress = ref<ProgressInfo>({ current: 0, total: 0, label: '' })
const enhanceProgress = ref<ProgressInfo>({ current: 0, total: 0, label: '' })
const errors = ref<string[]>([])
const done = ref(false)

const enhanceEnabled = ref(false)
const enhanceScale = ref<EnhanceScale>(4)
const enhanceModel = ref<EnhanceModel>('RealESRGAN_General_x4_v3')
const enhanceSelectedIds = ref<Set<string>>(new Set(props.textures.map((t) => t.id)))

const isRunning = computed(() => isExtracting.value || isEnhancing.value)

const dialogOpen = computed({
  get: () => props.isOpen,
  set: (val) => emit('update:isOpen', val),
})

const progressPercent = computed(() =>
  progress.value.total > 0 ? (progress.value.current / progress.value.total) * 100 : 0,
)

const enhanceProgressPercent = computed(() =>
  enhanceProgress.value.total > 0
    ? (enhanceProgress.value.current / enhanceProgress.value.total) * 100
    : 0,
)

const activeProgress = computed(() => {
  if (isEnhancing.value) return enhanceProgress.value
  if (done.value && enhanceProgress.value.total > 0) return enhanceProgress.value
  return progress.value
})
const activePercent = computed(() => {
  if (isEnhancing.value) return enhanceProgressPercent.value
  if (done.value && enhanceProgress.value.total > 0) return enhanceProgressPercent.value
  return progressPercent.value
})

const phaseLabel = computed(() => {
  const hasEnhance = enhanceEnabled.value && enhanceSelectedIds.value.size > 0
  if (!hasEnhance) return null
  return isExtracting.value ? 'Step 1/2 · Extracting' : 'Step 2/2 · Enhancing with AI'
})

const outputTree = computed<TreeFolder[]>(() => {
  const folderMap = new Map<string, string[]>()
  for (const t of props.textures) {
    let folderKey: string
    let fileName: string
    if (t.category === 'preview') {
      const lastSlash = t.path.lastIndexOf('/')
      folderKey = lastSlash >= 0 ? t.path.slice(0, lastSlash) : ''
      fileName = lastSlash >= 0 ? t.path.slice(lastSlash + 1) : t.path
    } else {
      const kn5 = t.kn5File ?? ''
      const skin = t.skinFolder ?? ''
      folderKey = kn5 && !skin ? kn5 : `skins/${skin}`
      fileName = t.name.replace(/\.dds$/i, '.png')
    }
    if (!folderMap.has(folderKey)) folderMap.set(folderKey, [])
    folderMap.get(folderKey)?.push(fileName)
  }
  return Array.from(folderMap.entries()).map(([name, files]) => ({ name, files }))
})

function textureKn5(t: Texture): string {
  return t.source === 'kn5' ? t.path : t.skinFolder ? '' : t.path
}

async function handleExtract() {
  if (!outputDir.value) return
  isExtracting.value = true
  progress.value = { current: 0, total: 0, label: '' }
  errors.value = []

  const unlisten = await onExtractProgress((p) => {
    progress.value = p
  })

  try {
    const errs = await extractTextures(
      props.modPath,
      props.textures.map((t) => t.name),
      props.textures.map(textureKn5),
      props.textures.map((t) => t.skinFolder ?? ''),
      props.textures.map((t) => t.id),
      outputDir.value,
    )
    errors.value = errs
  } finally {
    isExtracting.value = false
    unlisten()
  }

  const toEnhance = enhanceEnabled.value
    ? props.textures.filter((t) => enhanceSelectedIds.value.has(t.id))
    : []

  if (toEnhance.length > 0) {
    isEnhancing.value = true
    enhanceProgress.value = { current: 0, total: 0, label: '' }

    const unlistenEnhance = await onEnhanceProgress((p) => {
      enhanceProgress.value = p
    })

    try {
      const enhanceErrors = await enhanceExtractedTextures(
        outputDir.value,
        props.modName,
        toEnhance.map((t) => t.name),
        toEnhance.map(textureKn5),
        toEnhance.map((t) => t.skinFolder ?? ''),
        enhanceScale.value,
        enhanceModel.value,
      )
      errors.value = [...errors.value, ...enhanceErrors]
    } finally {
      isEnhancing.value = false
      unlistenEnhance()
    }
  }

  done.value = true
}

function handleClose() {
  if (isRunning.value) return
  const wasDone = done.value
  done.value = false
  errors.value = []
  progress.value = { current: 0, total: 0, label: '' }
  enhanceProgress.value = { current: 0, total: 0, label: '' }
  dialogOpen.value = false
  if (wasDone) emit('done')
}

const cancelConfirm = useCancelConfirm(handleClose)

function handleEscapeKey() {
  if (done.value) handleClose()
  else if (!isRunning.value) cancelConfirm.request()
}

async function browseOutputDir() {
  const dir = await open({ directory: true, multiple: false })
  if (dir && !Array.isArray(dir)) outputDir.value = dir
}

function preventInteractOutside(e: Event) {
  e.preventDefault()
}

watch(dialogOpen, (val) => {
  if (!val) cancelConfirm.reset()
})

watch(
  () => props.textures,
  (val) => {
    enhanceSelectedIds.value = new Set(val.map((t) => t.id))
  },
)

defineExpose({
  FileImageIcon,
  FolderIcon,
  FolderOpenIcon,
  SparklesIcon,
  Spinner,
  ExtractEnhanceConfig,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
  dialogOpen,
  outputDir,
  isExtracting,
  isEnhancing,
  isRunning,
  progress,
  enhanceProgress,
  errors,
  done,
  enhanceEnabled,
  enhanceScale,
  enhanceModel,
  enhanceSelectedIds,
  progressPercent,
  enhanceProgressPercent,
  activeProgress,
  activePercent,
  phaseLabel,
  outputTree,
  browseOutputDir,
  handleExtract,
  handleClose,
  handleEscapeKey,
  preventInteractOutside,
  cancelConfirm,
})
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent
      class="max-w-lg"
      :show-close-button="false"
      @interact-outside="preventInteractOutside"
      @escape-key-down.prevent="handleEscapeKey"
    >
      <DialogHeader>
        <DialogTitle>Extract {{ textures.length }} texture{{ textures.length !== 1 ? 's' : '' }}</DialogTitle>
        <DialogDescription class="sr-only">Choose an output folder and extract selected textures as PNG files.</DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <!-- Output folder -->
        <div>
          <label class="block text-[11px] text-muted-foreground mb-1">Output folder</label>
          <div class="flex gap-2">
            <div
              class="flex-1 text-xs px-3 py-2 rounded border bg-muted truncate font-mono"
              :class="outputDir ? '' : 'text-muted-foreground'"
            >
              {{ outputDir || 'No folder selected' }}
            </div>
            <button
              class="flex items-center gap-1.5 text-xs px-3 py-2 rounded border hover:bg-accent transition-colors"
              :disabled="isRunning"
              @click="browseOutputDir"
            >
              <FolderOpenIcon :size="13" />
              Browse
            </button>
          </div>
        </div>

        <!-- Enhance toggle -->
        <div v-if="!isRunning && !done" class="flex items-center gap-2">
          <input
            id="enhance-toggle"
            v-model="enhanceEnabled"
            type="checkbox"
            class="accent-primary"
          />
          <label for="enhance-toggle" class="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <SparklesIcon :size="12" />
            Enhance textures with AI after extraction
          </label>
        </div>

        <!-- Enhance config -->
        <ExtractEnhanceConfig
          v-if="enhanceEnabled && !isRunning && !done"
          :textures="textures"
          :scale="enhanceScale"
          :model="enhanceModel"
          :selected-ids="enhanceSelectedIds"
          @update:scale="enhanceScale = $event"
          @update:model="enhanceModel = $event"
          @update:selected-ids="enhanceSelectedIds = $event"
        />

        <!-- Output tree -->
        <div v-if="outputDir && !isRunning && !done">
          <label class="block text-[11px] text-muted-foreground mb-1">Output structure</label>
          <div class="bg-muted rounded border overflow-y-auto max-h-40 py-1.5 px-2 space-y-0.5">
            <div v-for="folder in outputTree" :key="folder.name">
              <div class="flex items-center gap-1.5 text-[11px] font-medium py-0.5">
                <FolderIcon :size="13" class="text-amber-500 shrink-0" />
                <span class="font-mono">{{ folder.name ? `${modName}/${folder.name}/` : `${modName}/` }}</span>
              </div>
              <div
                v-for="file in folder.files"
                :key="file"
                class="flex items-center gap-1.5 text-[11px] text-muted-foreground py-0.5 pl-5"
              >
                <FileImageIcon :size="12" class="shrink-0" />
                <span class="font-mono">{{ file }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Progress -->
        <div v-if="isRunning || (done && (progress.total > 0 || enhanceProgress.total > 0))">
          <p v-if="phaseLabel && isRunning" class="text-[11px] text-muted-foreground mb-1">
            {{ phaseLabel }}
          </p>
          <div class="flex items-center justify-between text-xs mb-1">
            <div class="flex items-center gap-1.5 text-muted-foreground min-w-0">
              <Spinner v-if="isRunning" :size="11" />
              <span class="truncate font-mono">
                {{ isRunning ? (activeProgress.label || 'Processing…') : 'Done' }}
              </span>
            </div>
            <span v-if="activeProgress.total > 0" class="shrink-0 ml-2 text-foreground font-medium">
              {{ activeProgress.current }}/{{ activeProgress.total }}
            </span>
          </div>
          <Progress :model-value="activePercent" class="h-1.5" />
        </div>

        <!-- Success -->
        <div v-if="done && errors.length === 0" class="text-xs text-green-600">
          Extracted successfully to {{ outputDir }}
        </div>

        <!-- Errors -->
        <div v-if="errors.length > 0" class="space-y-1">
          <p class="text-xs text-amber-600">{{ errors.length }} error(s):</p>
          <p v-for="e in errors" :key="e" class="text-[11px] font-mono text-destructive">{{ e }}</p>
        </div>
      </div>

      <DialogFooter>
        <Button v-if="done" variant="outline" size="sm" @click="handleClose">
          Close
        </Button>
        <Button
          v-else
          data-testid="cancel-btn"
          :variant="cancelConfirm.confirming.value ? 'destructive' : 'outline'"
          size="sm"
          :disabled="isRunning"
          :aria-label="cancelConfirm.confirming.value ? 'Really cancel?' : 'Cancel'"
          class="relative overflow-hidden min-w-[8rem]"
          @click="cancelConfirm.request"
        >
          <span
            aria-hidden="true"
            class="absolute inset-0 flex items-center justify-center transition-opacity duration-150"
            :class="cancelConfirm.confirming.value ? 'opacity-0' : 'opacity-100'"
          >Cancel</span>
          <span
            aria-hidden="true"
            class="absolute inset-0 flex items-center justify-center transition-opacity duration-150"
            :class="cancelConfirm.confirming.value ? 'opacity-100' : 'opacity-0'"
          >Really cancel?</span>
          <span aria-hidden="true" class="invisible">Really cancel?</span>
        </Button>
        <Button
          v-if="!done"
          size="sm"
          :disabled="!outputDir || isRunning"
          @click="handleExtract"
        >
          <SparklesIcon v-if="enhanceEnabled && enhanceSelectedIds.size > 0" :size="13" class="mr-1.5" />
          {{ enhanceEnabled && enhanceSelectedIds.size > 0 ? 'Extract & Enhance' : 'Extract' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
