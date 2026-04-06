<script setup lang="ts">
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { useTheme } from '@/composables/useTheme'

const theme = useTheme()

const currentIcon = computed(() => {
  if (theme.mode.value === 'dark') return MoonIcon
  if (theme.mode.value === 'system') return MonitorIcon
  return SunIcon
})

defineExpose({ currentIcon })
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    :aria-label="`Theme: ${theme.mode.value}`"
    @click="theme.cycleMode()"
  >
    <component :is="currentIcon" class="h-4 w-4" />
  </button>
</template>
