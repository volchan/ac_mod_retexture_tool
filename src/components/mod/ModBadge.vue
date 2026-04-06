<script setup lang="ts">
import type { ModType } from '@/types/index'

defineProps<{ type: ModType }>()
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
    :class="
      type === 'car'
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
        : 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200'
    "
  >
    {{ type === 'car' ? 'Car' : 'Track' }}
  </span>
</template>
