<script setup lang="ts">
import { DownloadIcon, GridIcon, SearchIcon } from 'lucide-vue-next'
import { useTextureFilter } from '@/composables/useTextureFilter'
import type { TextureCategory, TextureDensity } from '@/types/index'

const props = defineProps<{
  categories: TextureCategory[]
  selectedCount: number
  isDecoding: boolean
}>()

const emit = defineEmits<{
  'select-all': []
  'deselect-all': []
  extract: []
}>()

const { activeCategory, searchQuery, density, setCategory, setSearch, setDensity } =
  useTextureFilter()

const CATEGORY_LABELS: Record<TextureCategory, string> = {
  all: 'All',
  body: 'Body',
  livery: 'Livery',
  interior: 'Interior',
  wheels: 'Wheels',
  road: 'Road',
  terrain: 'Terrain',
  buildings: 'Buildings',
  props: 'Props',
  sky: 'Sky',
  other: 'Other',
  preview: 'Preview image',
}

const DENSITIES: { key: TextureDensity; icon: number }[] = [
  { key: 'sm', icon: 10 },
  { key: 'md', icon: 11 },
  { key: 'lg', icon: 12 },
]

defineExpose({
  GridIcon,
  SearchIcon,
  DownloadIcon,
  activeCategory,
  searchQuery,
  density,
  props,
  CATEGORY_LABELS,
  DENSITIES,
  setCategory,
  setSearch,
  setDensity,
  emit,
})
</script>

<template>
  <div class="flex items-center gap-2 px-3.5 py-2.5 border-b bg-card shrink-0 flex-wrap">
    <!-- Category pill segment -->
    <div class="flex gap-px bg-muted rounded-md p-0.5 border border-border">
      <button
        v-for="cat in categories"
        :key="cat"
        class="px-2 py-1 rounded-[5px] text-[11.5px] font-medium cursor-pointer transition-all whitespace-nowrap"
        :class="
          activeCategory === cat
            ? 'bg-card shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="setCategory(cat)"
      >
        {{ CATEGORY_LABELS[cat] }}
      </button>
    </div>

    <!-- Search -->
    <div class="w-[200px] relative">
      <SearchIcon :size="12" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <input
        :value="searchQuery"
        type="text"
        placeholder="Filter textures…"
        class="w-full h-7 pl-7 pr-2.5 text-[12px] bg-card border border-border rounded-[7px] outline-none focus:border-primary focus:ring-2 focus:ring-[var(--accent-muted)] transition-all"
        @input="setSearch(($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="flex-1" />

    <!-- Density toggle -->
    <div class="flex gap-px bg-muted rounded-md p-0.5 border border-border">
      <button
        v-for="d in DENSITIES"
        :key="d.key"
        class="w-[22px] h-5 rounded-[4px] flex items-center justify-center cursor-pointer transition-all"
        :class="
          density === d.key
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        "
        :aria-label="`${d.key} tile size`"
        :aria-pressed="density === d.key"
        :title="`${d.key} tiles`"
        @click="setDensity(d.key)"
      >
        <GridIcon :size="d.icon" />
      </button>
    </div>

    <!-- Selection info + actions -->
    <span class="text-[11.5px] text-muted-foreground">{{ selectedCount }} selected</span>
    <button
      class="text-[12px] px-2 py-1 rounded-[7px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      @click="$emit('select-all')"
    >
      Select all
    </button>
    <button
      v-if="selectedCount > 0"
      class="text-[12px] px-2 py-1 rounded-[7px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      @click="$emit('deselect-all')"
    >
      Deselect
    </button>
    <button
      v-if="selectedCount > 0"
      class="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-[7px] bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      :disabled="isDecoding"
      @click="$emit('extract')"
    >
      <DownloadIcon :size="12" />
      Extract {{ selectedCount }}
    </button>
  </div>
</template>
