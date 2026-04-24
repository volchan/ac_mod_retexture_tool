<script setup lang="ts">
import { CarIcon, ImageIcon, MapPinIcon } from 'lucide-vue-next'
import type { LibraryEntry } from '@/types/index'

defineProps<{ entry: LibraryEntry }>()
defineEmits<{ open: [] }>()

defineExpose({ CarIcon, ImageIcon, MapPinIcon })
</script>

<template>
  <div
    class="p-3.5 bg-card border border-border rounded-[10px] cursor-pointer hover:border-[var(--accent-border)] transition-all"
    @click="$emit('open')"
  >
    <!-- Header row -->
    <div class="flex items-center gap-1.5 mb-2">
      <span
        class="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-px rounded border"
        :class="
          entry.modType === 'car'
            ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
            : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
        "
      >
        <CarIcon v-if="entry.modType === 'car'" :size="10" />
        <MapPinIcon v-else :size="10" />
        {{ entry.modType === 'car' ? 'Car' : 'Track' }}
      </span>
      <span
        class="text-[10px] px-1.5 py-px rounded border text-muted-foreground"
        :class="entry.isKunos ? 'border-border bg-muted' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400'"
      >
        {{ entry.isKunos ? 'Kunos' : 'Mod' }}
      </span>
      <div class="flex-1" />
      <span class="text-[10.5px] text-muted-foreground">
        <template v-if="entry.modType === 'car' && entry.skinCount != null">
          {{ entry.skinCount }} skins
        </template>
        <template v-else-if="entry.modType === 'track' && entry.layouts != null">
          {{ entry.layouts }} layouts
        </template>
      </span>
    </div>

    <!-- Name and folder -->
    <div class="text-[14px] font-semibold text-foreground mb-0.5 truncate" :title="entry.name">
      {{ entry.name }}
    </div>
    <div class="text-[11px] font-mono text-muted-foreground mb-2.5 truncate">{{ entry.id }}</div>

    <!-- Chips row -->
    <div class="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
      <span class="inline-flex items-center gap-1">
        <ImageIcon :size="10" />
        {{ entry.textureCount }}
      </span>
      <span v-if="entry.country">{{ entry.country }}</span>
      <span v-if="entry.length">{{ (entry.length / 1000).toFixed(2) }} km</span>
      <span v-if="entry.brand">{{ entry.brand }}</span>
      <span v-if="entry.bhp">{{ entry.bhp }} bhp</span>
      <span v-if="entry.year">{{ entry.year }}</span>
    </div>

    <!-- Author footer -->
    <div
      v-if="entry.author"
      class="mt-2.5 pt-2.5 border-t border-border text-[10.5px] text-muted-foreground truncate"
    >
      by {{ entry.author }}
    </div>
  </div>
</template>
