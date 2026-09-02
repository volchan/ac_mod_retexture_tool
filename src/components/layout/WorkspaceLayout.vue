<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import Kn5Sidebar from '@/components/mod/Kn5Sidebar.vue'
import ModInfoPanel from '@/components/repack/ModInfoPanel.vue'
import TexturePanel from '@/components/texture/TexturePanel.vue'
import type { Mod, Texture } from '@/types/index'

const LEFT_MIN = 150
const LEFT_MAX = 420

const props = defineProps<{
  mod: Mod
  textures: Texture[]
}>()

const emit = defineEmits<{
  repack: []
  close: []
  'open-cmd': []
  'test-in-game': []
  'export-skin': []
}>()

const leftWidth = useLocalStorage('workspace-left-width', 210)
const isResizing = ref(false)

function startResize(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true
  const startX = e.clientX
  const startWidth = leftWidth.value

  function onMove(ev: MouseEvent) {
    leftWidth.value = Math.min(LEFT_MAX, Math.max(LEFT_MIN, startWidth + ev.clientX - startX))
  }

  function onUp() {
    isResizing.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

defineExpose({
  AppHeader,
  Kn5Sidebar,
  ModInfoPanel,
  TexturePanel,
  props,
  emit,
  leftWidth,
  isResizing,
  startResize,
})
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden" :class="{ 'select-none': isResizing }">
    <!-- Header -->
    <AppHeader :mod="mod" @open-cmd="$emit('open-cmd')" />

    <!-- Main 3-column body -->
    <main class="flex flex-1 overflow-hidden min-h-0">
      <!-- Left: KN5 sidebar (resizable) -->
      <aside
        :style="{ width: `${leftWidth}px` }"
        class="shrink-0 bg-card flex flex-col overflow-hidden"
      >
        <Kn5Sidebar :mod="mod" :textures="textures" @close="$emit('close')" />
      </aside>

      <!-- Resize handle -->
      <div
        class="w-1 shrink-0 cursor-col-resize border-r border-l border-border transition-colors hover:border-primary/60"
        :class="isResizing ? 'border-primary/60' : ''"
        @mousedown="startResize"
      />

      <!-- Center: texture grid -->
      <section class="flex-1 flex flex-col overflow-hidden min-w-0 bg-background">
        <TexturePanel :mod="mod" />
      </section>

      <!-- Right: mod info / queue (280px) -->
      <aside class="w-[280px] shrink-0 border-l bg-card flex flex-col overflow-hidden">
        <ModInfoPanel
          :mod="mod"
          @repack="$emit('repack')"
          @test-in-game="$emit('test-in-game')"
          @export-skin="$emit('export-skin')"
        />
      </aside>
    </main>
  </div>
</template>
