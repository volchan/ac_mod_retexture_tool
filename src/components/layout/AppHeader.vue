<script setup lang="ts">
import { SquarePlusIcon } from 'lucide-vue-next'
import ThemeToggle from '@/components/theme/ThemeToggle.vue'

defineExpose({ SquarePlusIcon, ThemeToggle })
</script>

<template>
  <header class="h-10 px-4 flex items-center justify-between border-b shrink-0">
    <div class="flex items-center gap-2">
      <SquarePlusIcon :size="16" class="text-muted-foreground" />
      <span class="font-semibold text-sm">AC Mod Retexture Tool</span>
      <span class="text-[11px] text-muted-foreground ml-1">v0.1.0</span>
    </div>
    <ThemeToggle />
  </header>
</template>
