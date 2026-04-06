<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import StatusBar from '@/components/layout/StatusBar.vue'

defineProps<{
  modName?: string
  textureCount?: number
  selectedCount?: number
}>()

defineExpose({ AppHeader, StatusBar })
</script>

<template>
  <div class="h-screen flex flex-col">
    <AppHeader />
    <main class="flex flex-1 overflow-hidden">
      <aside class="w-[280px] flex flex-col border-r bg-muted shrink-0">
        <div
          class="px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b font-medium shrink-0"
        >
          MOD SOURCE
        </div>
        <div class="flex-1 overflow-auto p-3">
          <slot name="left" />
        </div>
      </aside>
      <section class="flex-1 flex flex-col overflow-hidden bg-background">
        <slot name="center" />
      </section>
      <aside class="w-[320px] flex flex-col border-l bg-muted shrink-0">
        <div
          class="px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b font-medium shrink-0"
        >
          MOD INFO
        </div>
        <div class="flex-1 overflow-auto p-3">
          <slot name="right" />
        </div>
      </aside>
    </main>
    <StatusBar :mod-name="modName" :texture-count="textureCount" :selected-count="selectedCount" />
  </div>
</template>
