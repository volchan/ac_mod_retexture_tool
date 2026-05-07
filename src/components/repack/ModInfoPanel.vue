<script setup lang="ts">
import { ArchiveIcon, PlayIcon } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import QueueDrawer from '@/components/texture/QueueDrawer.vue'
import { useGlobalCommands } from '@/composables/useGlobalCommands'
import { useTextures } from '@/composables/useTextures'
import { previewLabel } from '@/lib/utils'
import type { Mod } from '@/types/index'

defineProps<{
  mod: Mod
}>()

const emit = defineEmits<{
  repack: []
  'test-in-game': []
}>()

const { textures } = useTextures()
const { queueTick } = useGlobalCommands()

const activeTab = ref<'info' | 'queue'>('info')

watch(queueTick, () => {
  activeTab.value = 'queue'
})

const replaced = computed(() => textures.value.filter((t) => t.replacement != null))
const replacementCount = computed(() => replaced.value.length)

const replacementByKn5 = computed(() => {
  const map = new Map<string, number>()
  for (const t of replaced.value) {
    const key =
      t.category === 'preview' ? previewLabel(t.name) : (t.kn5File ?? t.skinFolder ?? 'other')
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
})

const mismatchCount = computed(
  () =>
    replaced.value.filter(
      (t) =>
        t.replacement != null &&
        (t.replacement.width !== t.width || t.replacement.height !== t.height),
    ).length,
)

defineExpose({
  ArchiveIcon,
  PlayIcon,
  QueueDrawer,
  activeTab,
  replacementCount,
  replacementByKn5,
  mismatchCount,
  queueTick,
  previewLabel,
  emit,
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Tab bar -->
    <div class="flex gap-px bg-muted p-1 border-b shrink-0">
      <button
        class="flex-1 py-[7px] px-2.5 rounded-[5px] text-[11.5px] font-medium transition-all"
        :class="
          activeTab === 'info'
            ? 'bg-card shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="activeTab = 'info'"
      >
        Mod Info
      </button>
      <button
        class="flex-1 py-[7px] px-2.5 rounded-[5px] text-[11.5px] font-medium transition-all"
        :class="
          activeTab === 'queue'
            ? 'bg-card shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="activeTab = 'queue'"
      >
        Queue{{ replacementCount > 0 ? ` · ${replacementCount}` : '' }}
      </button>
    </div>

    <!-- Queue tab -->
    <div v-if="activeTab === 'queue'" class="flex-1 overflow-hidden">
      <QueueDrawer @repack="$emit('repack')" />
    </div>

    <!-- Info tab -->
    <div v-else class="flex flex-col gap-4 p-3 pb-4 flex-1 overflow-auto">
      <section>
        <p class="text-[10.5px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
          General
        </p>
        <div class="space-y-1.5">
          <div class="flex gap-2 text-[12px]">
            <span class="text-muted-foreground w-20 shrink-0">Name</span>
            <span class="font-medium truncate">{{ mod.meta.name }}</span>
          </div>
          <div class="flex gap-2 text-[12px]">
            <span class="text-muted-foreground w-20 shrink-0">Folder</span>
            <span class="font-mono truncate">{{ mod.meta.folderName }}</span>
          </div>
          <div class="flex gap-2 text-[12px]">
            <span class="text-muted-foreground w-20 shrink-0">Author</span>
            <span class="truncate">{{ mod.meta.author || '—' }}</span>
          </div>
          <div class="flex gap-2 text-[12px]">
            <span class="text-muted-foreground w-20 shrink-0">Version</span>
            <span>{{ mod.meta.version || '—' }}</span>
          </div>
          <div v-if="mod.meta.description" class="flex gap-2 text-[12px]">
            <span class="text-muted-foreground w-20 shrink-0">Description</span>
            <span class="line-clamp-3">{{ mod.meta.description }}</span>
          </div>
        </div>
      </section>

      <section v-if="mod.modType === 'car' && mod.carMeta">
        <p class="text-[10.5px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
          Car details
        </p>
        <div class="space-y-1.5">
          <div class="flex gap-2 text-[12px]">
            <span class="text-muted-foreground w-20 shrink-0">Brand</span>
            <span>{{ mod.carMeta.brand || '—' }}</span>
          </div>
          <div class="flex gap-2 text-[12px]">
            <span class="text-muted-foreground w-20 shrink-0">Class</span>
            <span>{{ mod.carMeta.carClass || '—' }}</span>
          </div>
          <div class="flex gap-2 text-[12px]">
            <span class="text-muted-foreground w-20 shrink-0">BHP</span>
            <span>{{ mod.carMeta.bhp || '—' }}</span>
          </div>
          <div class="flex gap-2 text-[12px]">
            <span class="text-muted-foreground w-20 shrink-0">Weight</span>
            <span>{{ mod.carMeta.weight ? `${mod.carMeta.weight} kg` : '—' }}</span>
          </div>
        </div>
      </section>

      <section v-if="mod.modType === 'track' && mod.trackMeta">
        <p class="text-[10.5px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
          Track details
        </p>
        <div class="space-y-1.5">
          <div class="flex gap-2 text-[12px]">
            <span class="text-muted-foreground w-20 shrink-0">Country</span>
            <span>{{ mod.trackMeta.country || '—' }}</span>
          </div>
          <div class="flex gap-2 text-[12px]">
            <span class="text-muted-foreground w-20 shrink-0">Length</span>
            <span>{{ mod.trackMeta.length ? `${mod.trackMeta.length} m` : '—' }}</span>
          </div>
          <div class="flex gap-2 text-[12px]">
            <span class="text-muted-foreground w-20 shrink-0">Pit boxes</span>
            <span>{{ mod.trackMeta.pitboxes || '—' }}</span>
          </div>
        </div>
      </section>

      <section
        v-if="replacementCount > 0"
        class="rounded-md border border-border bg-background px-3 py-2.5 space-y-2"
      >
        <div class="flex items-center justify-between">
          <p class="text-[11px] font-medium text-foreground">Queued for repack</p>
          <span class="text-[11px] font-medium text-[var(--accent-text)]">{{ replacementCount }}</span>
        </div>
        <div class="space-y-1">
          <div
            v-for="[file, count] in replacementByKn5"
            :key="file"
            class="flex items-center justify-between"
          >
            <span class="text-[10px] text-muted-foreground font-mono truncate max-w-[180px]">{{ file }}</span>
            <span class="text-[10px] text-muted-foreground shrink-0 ml-2">{{ count }}</span>
          </div>
        </div>
        <p v-if="mismatchCount > 0" class="text-[10px] text-amber-600 dark:text-amber-400">
          {{ mismatchCount }} texture{{ mismatchCount !== 1 ? 's have' : ' has' }} different
          dimensions — may cause visual issues in-game.
        </p>
      </section>

      <div class="mt-auto flex flex-col gap-2">
        <button
          v-if="mod.modType === 'track'"
          class="w-full flex items-center justify-center gap-1.5 text-[12px] px-3 py-2 rounded-[7px] bg-muted border border-border hover:bg-accent transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="replacementCount === 0"
          @click="$emit('test-in-game')"
        >
          <PlayIcon :size="12" />
          Test in Game
        </button>
        <button
          class="w-full flex items-center justify-center gap-1.5 text-[12px] px-3 py-2 rounded-[7px] bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          :disabled="replacementCount === 0"
          @click="$emit('repack')"
        >
          <ArchiveIcon :size="12" />
          Repack as .zip
        </button>
      </div>
    </div>
  </div>
</template>
