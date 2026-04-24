<script setup lang="ts">
import { useUpdateCheck } from '@/composables/useUpdateCheck'
import { openExternalUrl } from '@/lib/tauri'

defineProps<{
  modName?: string
  textureCount?: number
  queueCount?: number
}>()

const { updateAvailable, latestVersion, currentVersion } = useUpdateCheck()

defineExpose({ updateAvailable, latestVersion, currentVersion, openExternalUrl })
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
        @click="openExternalUrl('https://github.com/volchan/ac_mod_retexture_tool/releases/latest')"
      >
        New version available: v{{ latestVersion }}
      </button>
      <span v-else-if="currentVersion">v{{ currentVersion }}</span>
    </span>
    <span class="text-right flex items-center justify-end gap-2">
      <span v-if="modName && (queueCount ?? 0) > 0" class="text-[var(--accent-text)] font-medium">{{ queueCount }} queued</span>
    </span>
  </footer>
</template>
