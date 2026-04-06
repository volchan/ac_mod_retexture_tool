<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import { FileImageIcon, FolderIcon, FolderOpenIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
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

const progressPercent = computed(() =>
  progress.value.total > 0 ? (progress.value.current / progress.value.total) * 100 : 0,
)

const outputTree = computed<TreeFolder[]>(() => {
  const folderMap = new Map<string, string[]>()
  for (const t of props.textures) {
    const kn5 = t.kn5File ?? ''
    const skin = t.skinFolder ?? ''
    const folderKey = kn5 && !skin ? `${kn5}` : `skins/${skin}`
    if (!folderMap.has(folderKey)) folderMap.set(folderKey, [])
    folderMap.get(folderKey)?.push(t.name.replace(/\.dds$/i, '.png'))
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
      props.textures.map((t) => (t.source === 'kn5' ? t.path : '')),
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
  emit('update:isOpen', false)
  if (wasDone) emit('done')
}

defineExpose({
  FileImageIcon,
  FolderIcon,
  FolderOpenIcon,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
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
})
</script>

<template>
  <Dialog :open="isOpen" @update:open="handleClose">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>Extract {{ textures.length }} texture{{ textures.length !== 1 ? 's' : '' }}</DialogTitle>
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
                <span class="font-mono">{{ modName }}/{{ folder.name }}/</span>
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
        <button
          class="text-xs px-4 py-2 rounded border hover:bg-accent transition-colors"
          :disabled="isExtracting"
          @click="handleClose"
        >
          {{ done ? 'Close' : 'Cancel' }}
        </button>
        <button
          v-if="!done"
          class="text-xs px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="!outputDir || isExtracting"
          @click="handleExtract"
        >
          Extract
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
