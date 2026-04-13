<script setup lang="ts">
import { useUpdateCheck } from '@/composables/useUpdateCheck'
import { openExternalUrl } from '@/lib/tauri'

withDefaults(
  defineProps<{
    modName?: string
    textureCount?: number
    selectedCount?: number
    isDev?: boolean
  }>(),
  { isDev: import.meta.env.DEV },
)

const { updateAvailable, latestVersion } = useUpdateCheck()

defineExpose({ updateAvailable, latestVersion, openExternalUrl })
</script>

<template>
  <footer class="h-7 px-4 grid grid-cols-3 items-center border-t text-[11px] text-muted-foreground shrink-0">
    <span v-if="!modName">No mod loaded</span>
    <span v-else>{{ modName }} • {{ textureCount ?? 0 }} textures</span>
    <span class="text-center">
      <span v-if="isDev">dev build</span>
      <button
        v-else-if="updateAvailable"
        class="text-destructive font-medium hover:underline"
        @click="openExternalUrl('https://github.com/volchan/ac_mod_retexture_tool/releases/latest')"
      >
        New version available: v{{ latestVersion }}
      </button>
    </span>
    <span class="text-right">
      <span v-if="modName">{{ selectedCount ?? 0 }} selected</span>
    </span>
  </footer>
</template>
