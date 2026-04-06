<script setup lang="ts">
defineProps<{
  modName?: string
  textureCount?: number
  selectedCount?: number
}>()
</script>

<template>
  <footer class="h-7 px-4 flex items-center justify-between border-t text-[11px] text-muted-foreground shrink-0">
    <span v-if="!modName">No mod loaded</span>
    <span v-else>{{ modName }} • {{ textureCount ?? 0 }} textures</span>
    <span v-if="modName">{{ selectedCount ?? 0 }} selected</span>
  </footer>
</template>
