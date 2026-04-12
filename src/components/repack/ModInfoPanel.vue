<script setup lang="ts">
import { ArchiveIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { useTextures } from '@/composables/useTextures'
import { previewLabel } from '@/lib/utils'
import type { Mod } from '@/types/index'

defineProps<{
  mod: Mod
}>()

const emit = defineEmits<{
  repack: []
}>()

const { textures } = useTextures()

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
  emit,
  previewLabel,
  replacementCount,
  replacementByKn5,
  mismatchCount,
})
</script>

<template>
  <div class="flex flex-col gap-4 pb-4">
    <section>
      <p class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
        General
      </p>
      <div class="space-y-1.5">
        <div class="flex gap-2 text-xs">
          <span class="text-muted-foreground w-20 shrink-0">Name</span>
          <span class="font-medium truncate">{{ mod.meta.name }}</span>
        </div>
        <div class="flex gap-2 text-xs">
          <span class="text-muted-foreground w-20 shrink-0">Folder</span>
          <span class="font-mono truncate">{{ mod.meta.folderName }}</span>
        </div>
        <div class="flex gap-2 text-xs">
          <span class="text-muted-foreground w-20 shrink-0">Author</span>
          <span class="truncate">{{ mod.meta.author || '—' }}</span>
        </div>
        <div class="flex gap-2 text-xs">
          <span class="text-muted-foreground w-20 shrink-0">Version</span>
          <span>{{ mod.meta.version || '—' }}</span>
        </div>
        <div v-if="mod.meta.description" class="flex gap-2 text-xs">
          <span class="text-muted-foreground w-20 shrink-0">Description</span>
          <span class="line-clamp-3">{{ mod.meta.description }}</span>
        </div>
      </div>
    </section>

    <section v-if="mod.modType === 'car' && mod.carMeta">
      <p class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
        Car details
      </p>
      <div class="space-y-1.5">
        <div class="flex gap-2 text-xs">
          <span class="text-muted-foreground w-20 shrink-0">Brand</span>
          <span>{{ mod.carMeta.brand || '—' }}</span>
        </div>
        <div class="flex gap-2 text-xs">
          <span class="text-muted-foreground w-20 shrink-0">Class</span>
          <span>{{ mod.carMeta.carClass || '—' }}</span>
        </div>
        <div class="flex gap-2 text-xs">
          <span class="text-muted-foreground w-20 shrink-0">BHP</span>
          <span>{{ mod.carMeta.bhp || '—' }}</span>
        </div>
        <div class="flex gap-2 text-xs">
          <span class="text-muted-foreground w-20 shrink-0">Weight</span>
          <span>{{ mod.carMeta.weight ? `${mod.carMeta.weight} kg` : '—' }}</span>
        </div>
      </div>
    </section>

    <section v-if="mod.modType === 'track' && mod.trackMeta">
      <p class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
        Track details
      </p>
      <div class="space-y-1.5">
        <div class="flex gap-2 text-xs">
          <span class="text-muted-foreground w-20 shrink-0">Country</span>
          <span>{{ mod.trackMeta.country || '—' }}</span>
        </div>
        <div class="flex gap-2 text-xs">
          <span class="text-muted-foreground w-20 shrink-0">Length</span>
          <span>{{ mod.trackMeta.length ? `${mod.trackMeta.length} m` : '—' }}</span>
        </div>
        <div class="flex gap-2 text-xs">
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
        <span class="text-[11px] font-medium text-foreground">{{ replacementCount }}</span>
      </div>
      <div class="space-y-1">
        <div
          v-for="[file, count] in replacementByKn5"
          :key="file"
          class="flex items-center justify-between"
        >
          <span class="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">{{
            file
          }}</span>
          <span class="text-[10px] text-muted-foreground shrink-0 ml-2">{{ count }}</span>
        </div>
      </div>
      <p v-if="mismatchCount > 0" class="text-[10px] text-amber-600">
        {{ mismatchCount }} texture{{ mismatchCount !== 1 ? 's have' : ' has' }} different
        dimensions — may cause visual issues in-game.
      </p>
    </section>

    <div class="mt-auto">
      <button
        class="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="replacementCount === 0"
        @click="emit('repack')"
      >
        <ArchiveIcon :size="12" />
        Repack as .zip
      </button>
    </div>
  </div>
</template>
