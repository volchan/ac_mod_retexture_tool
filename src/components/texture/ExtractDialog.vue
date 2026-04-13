<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import { FileImageIcon, FolderIcon, FolderOpenIcon } from 'lucide-vue-next'
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
import { useCancelConfirm } from '@/composables/useCancelConfirm'
import { extractTextures, onExtractProgress } from '@/lib/tauri'
import type { ProgressInfo, Texture } from '@/types/index'

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
const progress = ref<ProgressInfo>({ current: 0, total: 0, label: '' })
const errors = ref<string[]>([])
const done = ref(false)

const dialogOpen = computed({
  get: () => props.isOpen,
  set: (val) => emit('update:isOpen', val),
})

const progressPercent = computed(() =>
  progress.value.total > 0 ? (progress.value.current / progress.value.total) * 100 : 0,
)

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

async function browsOutputDir() {
  const dir = await open({ directory: true, multiple: false })
  if (dir && !Array.isArray(dir)) outputDir.value = dir
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
      props.textures.map((t) => (t.source === 'kn5' ? t.path : t.skinFolder ? '' : t.path)),
      props.textures.map((t) => t.skinFolder ?? ''),
      props.textures.map((t) => t.id),
      outputDir.value,
    )
    errors.value = errs
    done.value = true
  } finally {
    isExtracting.value = false
    unlisten()
  }
}

function handleClose() {
  if (isExtracting.value) return
  const wasDone = done.value
  done.value = false
  errors.value = []
  progress.value = { current: 0, total: 0, label: '' }
  dialogOpen.value = false
  if (wasDone) emit('done')
}

const cancelConfirm = useCancelConfirm(handleClose)

watch(dialogOpen, (val) => {
  if (!val) cancelConfirm.reset()
})

defineExpose({
  FileImageIcon,
  FolderIcon,
  FolderOpenIcon,
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
  progress,
  errors,
  done,
  progressPercent,
  outputTree,
  browsOutputDir,
  handleExtract,
  handleClose,
  cancelConfirm,
})
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent class="max-w-lg" :show-close-button="false" @interact-outside.prevent>
      <DialogHeader>
        <DialogTitle>Extract {{ textures.length }} texture{{ textures.length !== 1 ? 's' : '' }}</DialogTitle>
        <DialogDescription class="sr-only">Choose an output folder and extract selected textures as PNG files.</DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
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
              :disabled="isExtracting"
              @click="browsOutputDir"
            >
              <FolderOpenIcon :size="13" />
              Browse
            </button>
          </div>
        </div>

        <div v-if="outputDir && !isExtracting && !done">
          <label class="block text-[11px] text-muted-foreground mb-1">Output structure</label>
          <div class="bg-muted rounded border overflow-y-auto max-h-48 py-1.5 px-2 space-y-0.5">
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

        <div v-if="isExtracting || (done && progress.total > 0)">
          <div class="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{{ isExtracting ? (progress.label || 'Extracting…') : 'Done' }}</span>
            <span v-if="progress.total > 0">{{ progress.current }}/{{ progress.total }}</span>
          </div>
          <Progress :model-value="progressPercent" class="h-1.5" />
        </div>

        <div v-if="done && errors.length === 0" class="text-xs text-green-600">
          Extracted successfully to {{ outputDir }}
        </div>
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
          :disabled="isExtracting"
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
          :disabled="!outputDir || isExtracting"
          @click="handleExtract"
        >
          Extract
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

