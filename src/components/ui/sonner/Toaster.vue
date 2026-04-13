<script setup lang="ts">
import { Toaster as Sonner } from 'vue-sonner'
import 'vue-sonner/style.css'
import { useTheme } from '@/composables/useTheme'

const { theme } = useTheme()

defineExpose({ Sonner, theme })
</script>

<template>
  <Sonner rich-colors position="bottom-right" :theme="theme" />
</template>
