<script setup lang="ts">
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useUpdateCheck } from '@/composables/useUpdateCheck'
import { openExternalUrl } from '@/lib/tauri'

defineProps<{
  modName?: string
  textureCount?: number
  queueCount?: number
}>()

const { updateAvailable, latestVersion, currentVersion, releaseUrl } = useUpdateCheck()
const { mode, cycleMode } = useTheme()

const themeIcon = computed(() => {
  if (mode.value === 'dark') return MoonIcon
  if (mode.value === 'system') return MonitorIcon
  return SunIcon
})

defineExpose({
  updateAvailable,
  latestVersion,
  currentVersion,
  releaseUrl,
  openExternalUrl,
  mode,
  cycleMode,
  themeIcon,
})
</script>

<template>
  <footer class="h-6 px-3.5 grid grid-cols-3 items-center border-t text-[10.5px] text-muted-foreground shrink-0 bg-card">
    <span class="flex items-center gap-1.5">
      <template v-if="modName">
        <span class="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
        <span>{{ modName }} · {{ textureCount ?? 0 }} textures</span>
      </template>
    </span>
    <span class="text-center">
      <button
        v-if="updateAvailable"
        class="text-destructive font-medium hover:underline"
        @click="openExternalUrl(releaseUrl)"
      >
        New version available: v{{ latestVersion }}
      </button>
      <span v-else-if="currentVersion">v{{ currentVersion }}</span>
    </span>
    <span class="text-right flex items-center justify-end gap-2">
      <span v-if="modName && (queueCount ?? 0) > 0" class="text-[var(--accent-text)] font-medium">{{ queueCount }} queued</span>
      <button
        type="button"
        class="inline-flex items-center justify-center w-4 h-4 hover:text-foreground transition-colors"
        :aria-label="`Theme: ${mode}`"
        @click="cycleMode()"
      >
        <component :is="themeIcon" class="w-3 h-3" />
      </button>
    </span>
  </footer>
</template>
