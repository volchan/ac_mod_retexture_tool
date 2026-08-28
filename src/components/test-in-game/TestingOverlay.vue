<script setup lang="ts">
import Spinner from '@/components/ui/spinner/Spinner.vue'

defineExpose({ Spinner })
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-sm">
    <Spinner class="w-8 h-8 text-[var(--accent-text)]" />
    <p class="text-[13px] font-medium text-foreground">Game is running…</p>
    <p class="text-[11.5px] text-muted-foreground">Close Assetto Corsa to return</p>
  </div>
</template>
