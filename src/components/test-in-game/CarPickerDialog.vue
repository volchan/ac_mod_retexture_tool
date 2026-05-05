<script setup lang="ts">
import { PlayIcon } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import Spinner from '@/components/ui/spinner/Spinner.vue'
import type { LibraryEntry } from '@/types/index'

const props = defineProps<{
  open: boolean
  cars: LibraryEntry[]
  isLoading: boolean
  selectedCarId: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:selectedCarId': [value: string | null]
  launch: []
}>()

const query = ref('')

watch(
  () => props.open,
  (val) => {
    if (!val) query.value = ''
  },
)

const filtered = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return props.cars
  return props.cars.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.brand ?? '').toLowerCase().includes(q),
  )
})

defineExpose({
  PlayIcon,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  props,
  emit,
  query,
  filtered,
})
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-[480px] flex flex-col gap-0 p-0 max-h-[560px]">
      <DialogHeader class="px-4 pt-4 pb-3 border-b shrink-0">
        <DialogTitle class="text-[13px]">Test in Game</DialogTitle>
      </DialogHeader>

      <div class="px-4 py-3 border-b shrink-0">
        <Input
          v-model="query"
          placeholder="Search cars…"
          class="h-8 text-[12px]"
          autofocus
        />
      </div>

      <div class="flex-1 overflow-y-auto min-h-0">
        <div v-if="isLoading" class="flex items-center justify-center py-10 gap-2 text-muted-foreground text-[12px]">
          <Spinner class="w-4 h-4" />
          Loading cars…
        </div>

        <div v-else-if="filtered.length === 0" class="flex items-center justify-center py-10 text-muted-foreground text-[12px]">
          No cars found
        </div>

        <ul v-else class="py-1">
          <li
            v-for="car in filtered"
            :key="car.id"
            class="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors text-[12px]"
            :class="
              selectedCarId === car.id
                ? 'bg-[var(--accent-bg)] text-[var(--accent-text)]'
                : 'hover:bg-muted text-foreground'
            "
            @click="$emit('update:selectedCarId', car.id)"
          >
            <span
              v-if="car.isKunos"
              class="inline-flex shrink-0 text-[9px] font-semibold px-1 py-px rounded border border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
            >
              KS
            </span>
            <span class="flex-1 truncate font-medium">{{ car.name }}</span>
            <span class="text-muted-foreground font-mono text-[10px] shrink-0">{{ car.id }}</span>
          </li>
        </ul>
      </div>

      <DialogFooter class="px-4 py-3 border-t shrink-0">
        <Button variant="outline" class="text-[12px] h-8" @click="$emit('update:open', false)">
          Cancel
        </Button>
        <Button
          class="text-[12px] h-8 gap-1.5"
          :disabled="!selectedCarId"
          @click="$emit('launch')"
        >
          <PlayIcon :size="11" />
          Launch
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
