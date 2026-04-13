<script setup lang="ts">
import { SquarePlusIcon } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import ThemeToggle from '@/components/theme/ThemeToggle.vue'
import { getAppVersion } from '@/lib/tauri'

const version = ref('')

onMounted(async () => {
  version.value = await getAppVersion()
})

defineExpose({ SquarePlusIcon, ThemeToggle, version })
</script>

<template>
  <header class="h-10 px-4 flex items-center justify-between border-b shrink-0">
    <div class="flex items-center gap-2">
      <SquarePlusIcon :size="16" class="text-muted-foreground" />
      <span class="font-semibold text-sm">AC Mod Retexture Tool</span>
      <span class="text-[11px] text-muted-foreground ml-1">v{{ version }}</span>
    </div>
    <ThemeToggle />
  </header>
</template>
