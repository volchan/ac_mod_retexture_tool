<script setup lang="ts">
import { Toaster as Sonner } from 'vue-sonner'
import 'vue-sonner/style.css'

defineExpose({ Sonner })
</script>

<template>
  <Sonner rich-colors position="bottom-right" />
</template>
