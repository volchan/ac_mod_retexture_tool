<script setup lang="ts">
import { ImageIcon } from 'lucide-vue-next'
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
import type { SkinEntry } from '@/types/index'

const props = defineProps<{
  open: boolean
  carName: string
  skins: SkinEntry[]
  isLoading: boolean
  error: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [skin: SkinEntry]
}>()

const query = ref('')
const selectedName = ref<string | null>(null)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) return
    query.value = ''
    selectedName.value = null
  },
)

const filtered = computed(() => {
  const q = query.value.toLowerCase().trim()
  if (!q) return props.skins
  return props.skins.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      (s.displayName ?? '').toLowerCase().includes(q) ||
      (s.driverName ?? '').toLowerCase().includes(q) ||
      (s.team ?? '').toLowerCase().includes(q),
  )
})

const selected = computed(() => props.skins.find((s) => s.name === selectedName.value) ?? null)

function confirm() {
  if (selected.value) emit('select', selected.value)
}

function openSkin(skin: SkinEntry) {
  selectedName.value = skin.name
  emit('select', skin)
}

defineExpose({
  ImageIcon,
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
  selectedName,
  filtered,
  selected,
  confirm,
  openSkin,
})
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-[620px] flex flex-col gap-0 p-0 max-h-[620px]">
      <DialogHeader class="px-4 pt-4 pb-3 border-b shrink-0">
        <DialogTitle class="text-[13px]">
          Pick a skin
          <span class="font-normal text-muted-foreground">· {{ carName }}</span>
        </DialogTitle>
      </DialogHeader>

      <div v-if="skins.length > 0" class="px-4 py-3 border-b shrink-0">
        <Input v-model="query" placeholder="Search skins…" class="h-8 text-[12px]" autofocus />
      </div>

      <div class="flex-1 overflow-y-auto min-h-0 p-3">
        <div
          v-if="isLoading"
          class="flex items-center justify-center py-10 gap-2 text-muted-foreground text-[12px]"
        >
          <Spinner class="w-4 h-4" />
          Loading skins…
        </div>

        <div
          v-else-if="error"
          class="flex items-center justify-center py-10 text-muted-foreground text-[12px]"
        >
          {{ error }}
        </div>

        <div
          v-else-if="filtered.length === 0"
          class="flex items-center justify-center py-10 text-muted-foreground text-[12px]"
        >
          No skins match “{{ query }}”
        </div>

        <div v-else class="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
          <button
            v-for="skin in filtered"
            :key="skin.name"
            type="button"
            class="text-left rounded-[9px] border overflow-hidden transition-all cursor-pointer"
            :class="
              selectedName === skin.name
                ? 'border-[var(--accent-bg)] ring-1 ring-[var(--accent-bg)]'
                : 'border-border hover:border-foreground/30'
            "
            @click="selectedName = skin.name"
            @dblclick="openSkin(skin)"
          >
            <div class="aspect-[16/9] bg-muted flex items-center justify-center overflow-hidden">
              <img
                v-if="skin.previewUrl"
                :src="skin.previewUrl"
                :alt="skin.name"
                class="w-full h-full object-cover"
              />
              <ImageIcon v-else :size="18" class="text-muted-foreground" />
            </div>
            <div class="px-2.5 py-2">
              <div class="text-[12px] font-medium truncate">
                {{ skin.displayName ?? skin.name }}
              </div>
              <div class="text-[10px] text-muted-foreground font-mono truncate">
                {{ skin.name }}
              </div>
              <div class="text-[10px] text-muted-foreground mt-1">
                {{ skin.textureCount }} texture{{ skin.textureCount === 1 ? '' : 's' }}
              </div>
            </div>
          </button>
        </div>
      </div>

      <DialogFooter class="px-4 py-3 border-t shrink-0">
        <Button variant="outline" class="text-[12px] h-8" @click="$emit('update:open', false)">
          Cancel
        </Button>
        <Button class="text-[12px] h-8" :disabled="!selected" @click="confirm">Open</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
