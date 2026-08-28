<script setup lang="ts">
import { SearchIcon } from 'lucide-vue-next'
import type { ModType } from '@/types/index'

defineProps<{
  total: number
  shown: number
  typeFilter: 'all' | ModType
  sourceFilter: 'all' | 'kunos' | 'mods'
  query: string
  sortBy: 'name' | 'textures'
}>()

const emit = defineEmits<{
  'update:typeFilter': ['all' | ModType]
  'update:sourceFilter': ['all' | 'kunos' | 'mods']
  'update:query': [string]
  'update:sortBy': ['name' | 'textures']
}>()

const SEGMENT_BTN =
  'text-[11.5px] font-medium px-2.5 py-1 rounded-[5px] transition-colors cursor-pointer border-none'
const SEGMENT_ACTIVE = 'bg-primary text-primary-foreground'
const SEGMENT_IDLE = 'bg-transparent text-muted-foreground hover:text-foreground'

function handleSortChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  if (value === 'name' || value === 'textures') emit('update:sortBy', value)
}

defineExpose({ SearchIcon, SEGMENT_BTN, SEGMENT_ACTIVE, SEGMENT_IDLE, handleSortChange, emit })
</script>

<template>
  <div
    class="px-7 py-3 flex items-center gap-2.5 bg-background border-b border-border overflow-x-auto"
  >
    <!-- Type segment control -->
    <div class="flex items-center gap-px bg-muted rounded-[7px] p-0.5 shrink-0">
      <button
        :class="[SEGMENT_BTN, typeFilter === 'all' ? SEGMENT_ACTIVE : SEGMENT_IDLE]"
        @click="emit('update:typeFilter', 'all')"
      >
        All
      </button>
      <button
        :class="[SEGMENT_BTN, typeFilter === 'car' ? SEGMENT_ACTIVE : SEGMENT_IDLE]"
        @click="emit('update:typeFilter', 'car')"
      >
        Cars
      </button>
      <button
        :class="[SEGMENT_BTN, typeFilter === 'track' ? SEGMENT_ACTIVE : SEGMENT_IDLE]"
        @click="emit('update:typeFilter', 'track')"
      >
        Tracks
      </button>
    </div>

    <!-- Source segment control -->
    <div class="flex items-center gap-px bg-muted rounded-[7px] p-0.5 shrink-0">
      <button
        :class="[SEGMENT_BTN, sourceFilter === 'all' ? SEGMENT_ACTIVE : SEGMENT_IDLE]"
        @click="emit('update:sourceFilter', 'all')"
      >
        All
      </button>
      <button
        :class="[SEGMENT_BTN, sourceFilter === 'kunos' ? SEGMENT_ACTIVE : SEGMENT_IDLE]"
        @click="emit('update:sourceFilter', 'kunos')"
      >
        Kunos
      </button>
      <button
        :class="[SEGMENT_BTN, sourceFilter === 'mods' ? SEGMENT_ACTIVE : SEGMENT_IDLE]"
        @click="emit('update:sourceFilter', 'mods')"
      >
        Mods
      </button>
    </div>

    <!-- Search input -->
    <div class="relative w-[260px] shrink-0">
      <SearchIcon
        :size="12"
        class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
      />
      <input
        type="text"
        :value="query"
        placeholder="Search mods…"
        class="w-full h-7 pl-7 pr-2.5 text-[12px] bg-card border border-border rounded-[7px] outline-none focus:border-primary transition-colors"
        @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="flex-1" />

    <span class="text-[11.5px] text-muted-foreground shrink-0">
      {{ shown }} of {{ total }}
    </span>

    <select
      :value="sortBy"
      class="text-[12px] h-7 px-2 pr-6 bg-card border border-border rounded-[7px] outline-none focus:border-primary transition-colors cursor-pointer appearance-none shrink-0"
      @change="handleSortChange"
    >
      <option value="name">Name A–Z</option>
      <option value="textures">Textures count</option>
    </select>
  </div>
</template>
