<script setup lang="ts">
import { AlertTriangleIcon } from 'lucide-vue-next'
import { computed, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCancelConfirm } from '@/composables/useCancelConfirm'
import type { MatchedTexture, UnmatchedFile } from '@/types/index'

const props = defineProps<{
  isOpen: boolean
  matched: MatchedTexture[]
  unmatched: UnmatchedFile[]
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
  apply: [matched: MatchedTexture[]]
}>()

const open = computed({
  get: () => props.isOpen,
  set: (val) => emit('update:isOpen', val),
})

const hasMismatch = computed(() => props.matched.some((m) => m.hasDimensionMismatch))
const mismatchCount = computed(() => props.matched.filter((m) => m.hasDimensionMismatch).length)

function sourceLabel(m: MatchedTexture): string {
  if (m.texture.kn5File) return m.texture.kn5File
  if (m.texture.skinFolder) return `skins/${m.texture.skinFolder}`
  return m.texture.path.split('/').pop() ?? m.texture.path
}

function handleApply() {
  emit('apply', props.matched)
  open.value = false
}

function handleClose() {
  open.value = false
}

const cancelConfirm = useCancelConfirm(handleClose)

watch(open, (val) => {
  if (!val) cancelConfirm.reset()
})

defineExpose({
  AlertTriangleIcon,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  open,
  hasMismatch,
  mismatchCount,
  sourceLabel,
  handleApply,
  handleClose,
  cancelConfirm,
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-lg" :show-close-button="false" @interact-outside.prevent>
      <DialogHeader>
        <DialogTitle>Replace {{ matched.length }} texture{{ matched.length !== 1 ? 's' : '' }}?</DialogTitle>
        <DialogDescription class="sr-only">Review matched and skipped textures before applying replacements.</DialogDescription>
      </DialogHeader>

      <div class="space-y-3 py-1">
        <p class="text-xs text-muted-foreground">
          These PNGs matched the folder structure and will replace the originals when you repack.
        </p>

        <div
          v-if="hasMismatch"
          class="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
        >
          <AlertTriangleIcon :size="14" class="text-amber-600 mt-0.5 shrink-0" />
          <div class="text-[11px] text-amber-700 dark:text-amber-400">
            <p class="font-medium">
              {{ mismatchCount }} texture{{ mismatchCount !== 1 ? 's have' : ' has' }} different dimensions
            </p>
            <p>This might cause visual issues in-game.</p>
          </div>
        </div>

        <div v-if="matched.length > 0">
          <p class="text-[11px] font-medium text-foreground mb-1.5">
            Matched
            <span class="ml-1 px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">{{ matched.length }}</span>
          </p>
          <div class="bg-muted rounded-md border overflow-y-auto max-h-52 divide-y divide-border">
            <div
              v-for="m in matched"
              :key="m.texture.id"
              class="flex items-center gap-2.5 px-2.5 py-2"
            >
              <img
                :src="m.previewUrl"
                :alt="m.texture.name"
                class="w-8 h-8 object-contain rounded shrink-0 bg-checkerboard"
              />
              <div class="flex-1 min-w-0">
                <p class="text-[11px] font-medium truncate">{{ m.texture.name }}</p>
                <p class="text-[10px] text-muted-foreground truncate">{{ sourceLabel(m) }}</p>
              </div>
              <div class="text-[10px] text-muted-foreground shrink-0 text-right whitespace-nowrap">
                <span>{{ m.texture.width }}×{{ m.texture.height }}</span>
                <span class="mx-1 opacity-50">→</span>
                <span :class="m.hasDimensionMismatch ? 'text-amber-600 font-medium' : ''">
                  {{ m.sourceWidth }}×{{ m.sourceHeight }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="unmatched.length > 0">
          <p class="text-[11px] font-medium text-foreground mb-1.5">
            Skipped
            <span class="ml-1 px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">{{ unmatched.length }}</span>
          </p>
          <div class="bg-muted rounded-md border overflow-y-auto max-h-28 divide-y divide-border">
            <div
              v-for="u in unmatched"
              :key="u.name"
              class="px-2.5 py-1.5"
            >
              <p class="text-[11px] font-mono">{{ u.name }}</p>
              <p class="text-[10px] text-muted-foreground">{{ u.reason }}</p>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          data-testid="cancel-btn"
          :variant="cancelConfirm.confirming.value ? 'destructive' : 'outline'"
          size="sm"
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
          size="sm"
          :disabled="matched.length === 0"
          @click="handleApply"
        >
          Apply {{ matched.length }} replacement{{ matched.length !== 1 ? 's' : '' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

