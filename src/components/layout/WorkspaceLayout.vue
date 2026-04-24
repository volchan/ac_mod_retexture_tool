<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import StatusBar from '@/components/layout/StatusBar.vue'
import Kn5Sidebar from '@/components/mod/Kn5Sidebar.vue'
import ModInfoPanel from '@/components/repack/ModInfoPanel.vue'
import TexturePanel from '@/components/texture/TexturePanel.vue'
import type { Mod, Texture } from '@/types/index'

const props = defineProps<{
  mod: Mod
  textures: Texture[]
  focusedTexture: Texture | null
  queueCount: number
}>()

const emit = defineEmits<{
  repack: []
  close: []
  'focus-texture': [texture: Texture]
  'open-cmd': []
}>()

defineExpose({
  AppHeader,
  StatusBar,
  Kn5Sidebar,
  ModInfoPanel,
  TexturePanel,
  props,
  emit,
})
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden">
    <!-- Header -->
    <AppHeader :mod="mod" @open-cmd="$emit('open-cmd')" />

    <!-- Main 3-column body -->
    <main class="flex flex-1 overflow-hidden min-h-0">
      <!-- Left: KN5 sidebar (210px) -->
      <aside class="w-[210px] shrink-0 border-r bg-card flex flex-col overflow-hidden">
        <Kn5Sidebar :mod="mod" :textures="textures" @close="$emit('close')" />
      </aside>

      <!-- Center: texture grid -->
      <section class="flex-1 flex flex-col overflow-hidden min-w-0 bg-background">
        <TexturePanel
          :mod="mod"
          @focus-texture="$emit('focus-texture', $event)"
        />
      </section>

      <!-- Right: mod info / queue (280px) -->
      <aside class="w-[280px] shrink-0 border-l bg-card flex flex-col overflow-hidden">
        <ModInfoPanel :mod="mod" @repack="$emit('repack')" />
      </aside>
    </main>

    <!-- Status bar -->
    <StatusBar
      :mod-name="mod.meta.name"
      :texture-count="textures.length"

      :queue-count="queueCount"
    />
  </div>
</template>
