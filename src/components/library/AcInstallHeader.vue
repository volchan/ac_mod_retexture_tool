<script setup lang="ts">
import { FolderIcon, RefreshCwIcon, Settings2Icon } from 'lucide-vue-next'
import type { AcInstall, AcInstallInfo } from '@/types/index'

defineProps<{
  install: AcInstall
  installInfo: AcInstallInfo
  isWindows: boolean
}>()
defineEmits<{ rescan: []; change: [] }>()

defineExpose({ FolderIcon, RefreshCwIcon, Settings2Icon })
</script>

<template>
  <div class="px-7 py-[18px] bg-card border-b border-border flex items-center gap-4">
    <div
      class="w-[42px] h-[42px] rounded-[10px] bg-[var(--accent-muted)] text-primary flex items-center justify-center shrink-0"
    >
      <FolderIcon :size="20" />
    </div>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-0.5">
        <span class="text-[11px] font-semibold text-green-500">✓ Detected</span>
        <span
          class="text-[10px] px-[5px] py-px rounded-[3px] bg-muted text-muted-foreground font-semibold uppercase tracking-wide font-mono"
        >{{ install.source }}</span>
        <span
          v-if="install.version"
          class="text-[10px] px-[5px] py-px rounded-[3px] bg-muted text-muted-foreground font-mono"
        >v{{ install.version }}</span>
      </div>
      <div class="text-[11.5px] font-mono text-foreground truncate">{{ install.path }}</div>
      <div class="text-[11px] text-muted-foreground mt-0.5">
        {{ installInfo.carCount }} cars · {{ installInfo.trackCount }} tracks
      </div>
    </div>

    <div class="flex items-center gap-1.5 shrink-0">
      <button
        v-if="isWindows"
        class="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-[6px] border border-border bg-transparent text-foreground hover:bg-muted transition-colors"
        @click="$emit('rescan')"
      >
        <RefreshCwIcon :size="13" />
        Rescan
      </button>
      <button
        class="inline-flex items-center justify-center w-[30px] h-[30px] rounded-[6px] border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Change location"
        @click="$emit('change')"
      >
        <Settings2Icon :size="15" />
      </button>
    </div>
  </div>
</template>
