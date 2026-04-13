<script setup lang="ts">
import { useUpdateCheck } from '@/composables/useUpdateCheck'
import { openExternalUrl } from '@/lib/tauri'

defineProps<{
  modName?: string
  textureCount?: number
  selectedCount?: number
}>()

const { updateAvailable, latestVersion } = useUpdateCheck()

defineExpose({ updateAvailable, latestVersion, openExternalUrl })
</script>

<template>
  <footer class="h-7 px-4 flex items-center border-t text-[11px] text-muted-foreground shrink-0">
    <span class="flex-1 truncate">
      <template v-if="!modName">No mod loaded</template>
      <template v-else>{{ modName }} • {{ textureCount ?? 0 }} textures</template>
    </span>
    <span class="flex-1 flex justify-center">
      <button
        v-if="updateAvailable"
        class="text-destructive font-medium hover:underline"
        @click="openExternalUrl('https://github.com/volchan/ac_mod_retexture_tool/releases/latest')"
      >
        New version available: v{{ latestVersion }}
      </button>
    </span>
    <span class="flex-1 flex justify-end truncate">
      <template v-if="modName">{{ selectedCount ?? 0 }} selected</template>
    </span>
  </footer>
</template>
