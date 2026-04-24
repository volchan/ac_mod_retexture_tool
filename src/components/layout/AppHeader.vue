<script setup lang="ts">
import { SearchIcon } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import ThemeToggle from '@/components/theme/ThemeToggle.vue'
import { getAppVersion } from '@/lib/tauri'
import type { Mod } from '@/types/index'

const props = defineProps<{
  mod?: Mod
}>()

const emit = defineEmits<{
  'open-cmd': []
}>()

const version = ref('')

onMounted(async () => {
  version.value = await getAppVersion()
})

defineExpose({
  SearchIcon,
  ThemeToggle,
  version,
  props,
  emit,
})
</script>

<template>
  <header class="h-11 px-3.5 flex items-center gap-2.5 border-b bg-card shrink-0">
    <!-- Logo + title -->
    <div class="flex items-center gap-2">
      <img src="/icon.png" alt="" class="w-5 h-5 shrink-0" />
      <span class="font-semibold text-[13px] tracking-tight">AC Mod Retexture Tool</span>
      <span class="text-[10.5px] text-muted-foreground font-mono">v{{ version }}</span>
    </div>

    <!-- Mod context (when loaded) -->
    <template v-if="mod">
      <div class="w-px h-4 bg-border mx-1.5" />
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

    <div class="flex-1" />

    <!-- ⌘K search bar -->
    <button
      class="flex items-center gap-2 min-w-[220px] h-[30px] px-2.5 bg-muted border border-border rounded-[7px] text-muted-foreground text-[12px] hover:border-border/80 transition-colors"
      @click="$emit('open-cmd')"
    >
      <SearchIcon :size="12" class="shrink-0" />
      <span class="flex-1 text-left">Search or run action…</span>
      <kbd class="font-mono text-[10px] px-1 py-px rounded bg-background text-muted-foreground border border-border font-medium">
        ⌘K
      </kbd>
    </button>

    <!-- Theme toggle -->
    <ThemeToggle />
  </header>
</template>
