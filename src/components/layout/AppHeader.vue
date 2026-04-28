<script setup lang="ts">
import { SearchIcon } from 'lucide-vue-next'
import type { Mod } from '@/types/index'

defineProps<{
  mod?: Mod
}>()

const emit = defineEmits<{
  'open-cmd': []
}>()

defineExpose({ SearchIcon, emit })
</script>

<template>
  <header class="h-11 px-3.5 flex items-center border-b bg-card shrink-0">
    <!-- Left: mod context -->
    <div class="flex-1 flex items-center gap-2">
      <template v-if="mod">
        <span
          class="inline-flex items-center text-[10.5px] font-medium px-1.5 py-px rounded border"
          :class="
            mod.modType === 'car'
              ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
              : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
          "
        >
          {{ mod.modType === 'car' ? 'Car' : 'Track' }}
        </span>
        <span class="text-[12.5px] font-medium text-foreground">{{ mod.meta.name }}</span>
        <span class="text-[11px] text-muted-foreground font-mono">{{ mod.meta.folderName }}</span>
      </template>
    </div>

    <!-- Center: ⌘K search bar -->
    <button
      class="flex items-center gap-2 w-[280px] h-[30px] px-2.5 bg-muted border border-border rounded-[7px] text-muted-foreground text-[12px] hover:border-border/80 transition-colors shrink-0"
      @click="$emit('open-cmd')"
    >
      <SearchIcon :size="12" class="shrink-0" />
      <span class="flex-1 text-left">Search or run action…</span>
      <kbd class="font-mono text-[10px] px-1 py-px rounded bg-background text-muted-foreground border border-border font-medium">
        ⌘K
      </kbd>
    </button>

    <!-- Right: spacer to balance left -->
    <div class="flex-1" />
  </header>
</template>
