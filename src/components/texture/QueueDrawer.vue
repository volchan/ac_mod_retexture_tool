<script setup lang="ts">
import { ArrowRightIcon, PackageIcon, XIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { useTextures } from '@/composables/useTextures'

const emit = defineEmits<{
  repack: []
}>()

const { textures, revertReplacement, revertAll } = useTextures()

const queued = computed(() =>
  textures.value
    .filter((t) => t.replacement != null)
    .map((t) => ({
      ...t,
      hasMismatch:
        t.replacement != null &&
        (t.replacement.width !== t.width || t.replacement.height !== t.height),
    })),
)

const mismatchCount = computed(() => queued.value.filter((q) => q.hasMismatch).length)

defineExpose({
  ArrowRightIcon,
  PackageIcon,
  XIcon,
  queued,
  mismatchCount,
  revertReplacement,
  revertAll,
  emit,
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-4 py-3 border-b shrink-0">
      <div class="text-[13px] font-semibold">Replacement queue</div>
      <div class="text-[11px] text-muted-foreground mt-0.5">
        {{ queued.length }} texture{{ queued.length !== 1 ? 's' : '' }}
        <template v-if="mismatchCount > 0">
          · <span class="text-amber-600 dark:text-amber-400">{{ mismatchCount }} size mismatch{{ mismatchCount !== 1 ? 'es' : '' }}</span>
        </template>
      </div>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-auto">
      <div
        v-if="queued.length === 0"
        class="flex flex-col items-center justify-center gap-3 h-full text-muted-foreground px-4"
      >
        <PackageIcon :size="28" class="opacity-40" />
        <div class="text-center">
          <p class="text-[12.5px] text-muted-foreground font-medium">No replacements queued</p>
          <p class="text-[11px] mt-1">Drop edited PNGs on the texture grid</p>
        </div>
      </div>

      <div
        v-for="q in queued"
        :key="q.id"
        class="flex items-center gap-2.5 px-3.5 py-2.5 border-b"
      >
        <!-- Original thumbnail -->
        <div class="w-10 h-10 rounded-[5px] checkerboard shrink-0 flex items-center justify-center overflow-hidden">
          <img v-if="q.isDecoded && q.previewUrl" :src="q.previewUrl" :alt="q.name" class="max-w-full max-h-full object-contain" />
        </div>

        <ArrowRightIcon :size="11" class="text-muted-foreground shrink-0" />

        <!-- Replacement thumbnail -->
        <div
          class="w-10 h-10 rounded-[5px] checkerboard shrink-0 flex items-center justify-center overflow-hidden border"
          :class="q.hasMismatch ? 'border-amber-400' : 'border-[var(--accent-border)]'"
        >
          <img v-if="q.replacement" :src="q.replacement.previewUrl" :alt="`${q.name} replacement`" class="max-w-full max-h-full object-contain" />
        </div>

        <!-- Info -->
        <div class="flex-1 min-w-0">
          <p class="text-[12px] font-medium font-mono truncate text-foreground">{{ q.name }}</p>
          <p class="text-[10.5px] font-mono text-muted-foreground mt-0.5">
            {{ q.kn5File ?? q.skinFolder ?? '—' }}
            <template v-if="q.hasMismatch">
              · <span class="text-amber-600 dark:text-amber-400">{{ q.width }}×{{ q.height }} → {{ q.replacement?.width }}×{{ q.replacement?.height }}</span>
            </template>
          </p>
        </div>

        <!-- Remove -->
        <button
          class="w-[22px] h-[22px] flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          title="Remove replacement"
          @click="revertReplacement(q.id)"
        >
          <XIcon :size="11" />
        </button>
      </div>
    </div>

    <!-- Footer -->
    <div v-if="queued.length > 0" class="p-3 border-t bg-muted/40 flex gap-2 shrink-0">
      <button
        class="flex-1 text-[13px] font-medium py-2 rounded-[7px] border border-border hover:bg-muted transition-colors"
        @click="revertAll()"
      >
        Clear all
      </button>
      <button
        class="flex-[2] flex items-center justify-center gap-1.5 text-[13px] font-medium py-2 rounded-[7px] bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        @click="$emit('repack')"
      >
        <PackageIcon :size="13" />
        Repack
      </button>
    </div>
  </div>
</template>
