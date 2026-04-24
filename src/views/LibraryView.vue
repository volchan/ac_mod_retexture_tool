<script setup lang="ts">
import { CarIcon, FolderIcon, ImageIcon, MapPinIcon, SearchIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { RecentMod } from '@/types/index'

const props = defineProps<{
  recentMods: RecentMod[]
}>()

const emit = defineEmits<{
  open: [path: string]
  browse: []
}>()

const searchQuery = ref('')

const filtered = computed(() =>
  props.recentMods.filter((m) => m.name.toLowerCase().includes(searchQuery.value.toLowerCase())),
)

function formatLastOpened(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return `${Math.floor(days / 7)}w ago`
}

defineExpose({
  CarIcon,
  FolderIcon,
  ImageIcon,
  MapPinIcon,
  SearchIcon,
  filtered,
  searchQuery,
  formatLastOpened,
  emit,
})
</script>

<template>
  <div class="h-full overflow-auto bg-background">
    <div class="max-w-4xl mx-auto px-10 py-10">
      <!-- Heading -->
      <div class="mb-6">
        <div class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-primary mb-1.5">
          Open a mod
        </div>
        <h1 class="text-[26px] font-bold tracking-tight text-foreground leading-none">Recent mods</h1>
        <p class="text-[13px] text-muted-foreground mt-1.5">Drop a folder anywhere, or pick from the list.</p>
      </div>

      <!-- Drop zone -->
      <div
        class="border-2 border-dashed border-border rounded-xl px-6 py-7 text-center bg-card mb-6 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
        @click="$emit('browse')"
      >
        <div class="w-11 h-11 rounded-xl bg-[var(--accent-muted)] inline-flex items-center justify-center text-primary mb-3">
          <FolderIcon :size="20" />
        </div>
        <div class="text-[14px] font-semibold text-foreground mb-1">Drop a mod folder here</div>
        <div class="text-[12px] text-muted-foreground mb-4">
          Supports <code class="font-mono">content/cars/…</code> and <code class="font-mono">content/tracks/…</code>
        </div>
        <button
          class="inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-[7px] bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          @click.stop="$emit('browse')"
        >
          Browse folder
        </button>
      </div>

      <!-- Recent section -->
      <div class="flex items-center gap-3 mb-3">
        <span class="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0">Recent</span>
        <div class="flex-1 h-px bg-border" />
        <div class="w-[220px] relative">
          <SearchIcon :size="12" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search…"
            class="w-full h-7 pl-7 pr-2.5 text-[12px] bg-card border border-border rounded-[7px] outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      <!-- Mods grid -->
      <div
        v-if="filtered.length > 0"
        class="grid gap-2.5"
        style="grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))"
      >
        <button
          v-for="m in filtered"
          :key="m.id"
          class="bg-card border border-border rounded-[9px] p-3.5 text-left cursor-pointer hover:border-border/80 transition-all hover:shadow-sm"
          @click="$emit('open', m.path)"
        >
          <div class="flex items-center gap-2 mb-2.5">
            <!-- Type badge -->
            <span
              class="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-px rounded border"
              :class="
                m.modType === 'car'
                  ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
                  : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
              "
            >
              <CarIcon v-if="m.modType === 'car'" :size="10" />
              <MapPinIcon v-else :size="10" />
              {{ m.modType === 'car' ? 'Car' : 'Track' }}
            </span>
            <div class="flex-1" />
            <span class="text-[10.5px] text-muted-foreground">{{ formatLastOpened(m.lastOpenedAt) }}</span>
          </div>
          <div class="text-[14px] font-semibold text-foreground mb-0.5 truncate" :title="m.name">{{ m.name }}</div>
          <div class="text-[11px] font-mono text-muted-foreground mb-3">{{ m.folderName }}</div>
          <div class="flex items-center gap-2.5 text-[11px] text-muted-foreground flex-wrap">
            <span v-if="m.textureCount" class="flex items-center gap-1">
              <ImageIcon :size="10" />
              {{ m.textureCount }}
            </span>
            <span v-if="m.country">{{ m.country }}</span>
            <span v-if="m.trackLength">{{ (m.trackLength / 1000).toFixed(2) }} km</span>
            <span v-if="m.pitboxes">{{ m.pitboxes }} pit boxes</span>
            <span v-if="m.carBrand">{{ m.carBrand }}</span>
            <span v-if="m.carBhp">{{ m.carBhp }} bhp</span>
          </div>
          <div class="mt-2.5 pt-2.5 border-t border-border text-[10.5px] text-muted-foreground">
            by {{ m.author || 'Kunos' }}
          </div>
        </button>
      </div>

      <div v-else-if="searchQuery" class="text-center py-12 text-muted-foreground text-[13px]">
        No mods matching "{{ searchQuery }}"
      </div>

      <div v-else class="text-center py-12 text-muted-foreground text-[13px]">
        No recent mods yet. Drop a mod folder to get started.
      </div>
    </div>
  </div>
</template>
