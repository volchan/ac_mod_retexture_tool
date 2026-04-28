<script setup lang="ts">
import { FolderOpenIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-vue-next'

defineProps<{ isWindows: boolean }>()
defineEmits<{ browse: []; rescan: [] }>()

defineExpose({ FolderOpenIcon, RefreshCwIcon, TriangleAlertIcon })
</script>

<template>
  <div class="flex-1 h-full bg-background flex items-center justify-center p-10">
    <div class="max-w-[480px] w-full text-center">
      <div
        class="inline-flex w-[52px] h-[52px] rounded-[14px] bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 items-center justify-center mb-4"
      >
        <TriangleAlertIcon :size="24" />
      </div>

      <h1 class="text-[22px] font-bold tracking-tight text-foreground mb-2">
        {{ isWindows ? 'Assetto Corsa not found' : 'Point to your AC folder' }}
      </h1>

      <p class="text-[13px] text-muted-foreground mb-7 leading-relaxed">
        <template v-if="isWindows">
          Point the toolkit to the folder that contains
          <code class="font-mono text-[12px]">content/cars</code> and
          <code class="font-mono text-[12px]">content/tracks</code>.
        </template>
        <template v-else>
          Assetto Corsa is a Windows game. If you're browsing a synced install, a Wine/Proton
          prefix, or a shared folder, pick that location here.
        </template>
      </p>

      <div class="flex items-center justify-center gap-2.5">
        <button
          class="inline-flex items-center gap-2 text-[13px] font-medium px-4 py-2 rounded-[7px] bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          @click="$emit('browse')"
        >
          <FolderOpenIcon :size="14" />
          Browse folder
        </button>
        <button
          v-if="isWindows"
          class="inline-flex items-center gap-2 text-[13px] font-medium px-4 py-2 rounded-[7px] border border-border bg-card text-foreground hover:bg-muted transition-colors"
          @click="$emit('rescan')"
        >
          <RefreshCwIcon :size="14" />
          Try again
        </button>
      </div>
    </div>
  </div>
</template>
