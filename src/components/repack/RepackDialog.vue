<script setup lang="ts">
import { CheckIcon, CircleIcon, FolderOpenIcon } from 'lucide-vue-next'
import { computed } from 'vue'
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
import { useRepack } from '@/composables/useRepack'
import type { Mod, TextureReplacementOpt } from '@/types/index'

const props = defineProps<{
  open: boolean
  mod: Mod
  outputPath: string
  replacements: TextureReplacementOpt[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  done: []
}>()

const { isRepacking, repackProgress, repackDone, repackError, startRepack, reset } = useRepack()

const STEPS = ['Copy files', 'Metadata', 'Textures', 'Archive'] as const

function labelToStep(label: string): number {
  const l = label.toLowerCase()
  if (l.includes('copy')) return 0
  if (l.includes('metadata')) return 1
  if (l.includes('recompi')) return 2
  if (l.includes('archiv')) return 3
  return -1
}

const currentStep = computed(() => labelToStep(repackProgress.value.label))

const progressPercent = computed(() => {
  if (repackProgress.value.total === 0) return 0
  return Math.round((repackProgress.value.current / repackProgress.value.total) * 100)
})

const replacementCount = computed(
  () => props.replacements.filter((r) => r.kn5File ?? r.skinFolder ?? r.heroImagePath).length,
)

const unchangedCount = computed(() => {
  const replaced = new Set(props.replacements.map((r) => r.textureName))
  let total = 0
  for (const kn5 of props.mod.kn5Files) {
    total++
    void kn5
  }
  return Math.max(0, total - replaced.size)
})

function stepState(index: number): 'done' | 'active' | 'pending' {
  if (repackDone.value) return 'done'
  if (currentStep.value > index) return 'done'
  if (currentStep.value === index) return 'active'
  return 'pending'
}

async function confirm() {
  const { meta, carMeta, trackMeta, path } = props.mod
  await startRepack({
    modPath: path,
    outputPath: props.outputPath,
    meta,
    carMeta,
    trackMeta,
    replacements: props.replacements,
  })
}

function close() {
  if (isRepacking.value) return
  reset()
  emit('update:open', false)
  if (repackDone.value) emit('done')
}

const cancelConfirm = useCancelConfirm(close)

defineExpose({
  CheckIcon,
  CircleIcon,
  FolderOpenIcon,
  Spinner,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
  isRepacking,
  repackProgress,
  repackDone,
  repackError,
  progressPercent,
  currentStep,
  stepState,
  labelToStep,
  confirm,
  close,
  STEPS,
  replacementCount,
  unchangedCount,
  cancelConfirm,
})
</script>

<template>
  <Dialog :open="open" @update:open="close">
    <DialogContent class="max-w-lg" :show-close-button="false" @interact-outside.prevent>
      <DialogHeader>
        <DialogTitle>Repack mod</DialogTitle>
        <DialogDescription>
          This will create a ZIP archive with the updated mod. Only
          {{ replacementCount }} texture{{ replacementCount !== 1 ? 's' : '' }} will be
          recompiled — everything else is copied from the original.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div
          class="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background text-xs font-mono text-muted-foreground"
        >
          <FolderOpenIcon :size="13" class="shrink-0" />
          <span class="truncate">{{ outputPath }}</span>
        </div>

        <div
          class="rounded-md border border-border bg-background px-3 py-2.5 space-y-1 text-xs"
        >
          <div class="flex gap-2">
            <span class="text-muted-foreground w-16 shrink-0">Name:</span>
            <span class="font-medium">{{ mod.meta.name }}</span>
          </div>
          <div class="flex gap-2">
            <span class="text-muted-foreground w-16 shrink-0">Folder:</span>
            <span class="font-mono">{{ mod.meta.folderName }}</span>
          </div>
          <div class="flex gap-2">
            <span class="text-muted-foreground w-16 shrink-0">Author:</span>
            <span>{{ mod.meta.author }}</span>
          </div>
          <div class="flex gap-2">
            <span class="text-muted-foreground w-16 shrink-0">Textures:</span>
            <span>{{ replacementCount }} recompiled, {{ unchangedCount }} unchanged</span>
          </div>
        </div>

        <div v-if="isRepacking || repackDone" class="space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="text-muted-foreground truncate">{{ repackProgress.label }}</span>
            <span class="text-foreground font-medium shrink-0 ml-2">{{ progressPercent }}%</span>
          </div>
          <Progress :model-value="progressPercent" class="h-1.5" />
          <div class="flex items-center gap-3 pt-1">
            <div
              v-for="(step, i) in STEPS"
              :key="step"
              class="flex items-center gap-1 text-[11px]"
              :class="stepState(i) === 'pending' ? 'text-muted-foreground' : 'text-foreground'"
            >
              <CheckIcon v-if="stepState(i) === 'done'" :size="11" class="text-green-600 shrink-0" />
              <Spinner v-else-if="stepState(i) === 'active'" :size="11" />
              <CircleIcon v-else :size="11" class="opacity-40 shrink-0" />
              {{ step }}
            </div>
          </div>
        </div>

        <p v-if="repackError" class="text-xs text-destructive">{{ repackError }}</p>

        <p v-if="repackDone" class="text-xs text-green-600 font-medium">
          Archive created successfully.
        </p>
      </div>

      <DialogFooter>
        <Button v-if="repackDone" variant="outline" size="sm" @click="close">
          Close
        </Button>
        <Button
          v-else
          data-testid="cancel-btn"
          :variant="cancelConfirm.confirming.value ? 'destructive' : 'outline'"
          size="sm"
          :disabled="isRepacking"
          class="relative overflow-hidden transition-colors duration-200 min-w-[8rem]"
          @click="cancelConfirm.request"
        >
          <span
            class="absolute inset-0 flex items-center justify-center transition-opacity duration-150"
            :class="cancelConfirm.confirming.value ? 'opacity-0' : 'opacity-100'"
          >Cancel</span>
          <span
            class="absolute inset-0 flex items-center justify-center transition-opacity duration-150"
            :class="cancelConfirm.confirming.value ? 'opacity-100' : 'opacity-0'"
          >Really cancel?</span>
          <span class="invisible">Really cancel?</span>
        </Button>
        <Button v-if="!repackDone" size="sm" :disabled="isRepacking" @click="confirm">
          {{ isRepacking ? 'Repacking…' : 'Confirm & repack' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

