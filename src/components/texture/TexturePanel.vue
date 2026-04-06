<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import CategoryTabs from '@/components/texture/CategoryTabs.vue'
import ExtractDialog from '@/components/texture/ExtractDialog.vue'
import ImportConfirmDialog from '@/components/texture/ImportConfirmDialog.vue'
import ImportDropZone from '@/components/texture/ImportDropZone.vue'
import TextureCard from '@/components/texture/TextureCard.vue'
import TrackHeroImages from '@/components/texture/TrackHeroImages.vue'
import { Progress } from '@/components/ui/progress'
import { useTextures } from '@/composables/useTextures'
import { scanImportFolder } from '@/lib/tauri'
import type { MatchedTexture, Mod, TextureCategory, UnmatchedFile } from '@/types/index'

const CAR_CATEGORIES: TextureCategory[] = ['all', 'body', 'livery', 'interior', 'wheels', 'other']
const TRACK_CATEGORIES: TextureCategory[] = [
  'all',
  'road',
  'terrain',
  'buildings',
  'props',
  'sky',
  'other',
]

const props = defineProps<{
  mod: Mod
}>()

const emit = defineEmits<{
  'selection-change': [selected: Set<string>]
}>()

const {
  textures,
  selected,
  decodeProgress,
  isDecoding,
  init,
  toggleSelect,
  selectAll,
  deselectAll,
  filteredTextures,
  applyReplacements,
  cleanup,
} = useTextures()

const activeCategory = ref<TextureCategory>('all')
const extractDialogOpen = ref(false)
const importDialogOpen = ref(false)
const importMatched = ref<MatchedTexture[]>([])
const importUnmatched = ref<UnmatchedFile[]>([])
const isScanning = ref(false)

const categories = computed<TextureCategory[]>(() =>
  props.mod.modType === 'car' ? CAR_CATEGORIES : TRACK_CATEGORIES,
)

const visibleTextures = computed(() => filteredTextures(activeCategory.value))

const progressPercent = computed(() => {
  if (decodeProgress.value.total === 0) return 0
  return (decodeProgress.value.current / decodeProgress.value.total) * 100
})

const selectedCount = computed(() => selected.value.size)

const showTrackHeroImages = computed(
  () => props.mod.modType === 'track' && activeCategory.value === 'all',
)

function handleCategoryChange(cat: TextureCategory) {
  activeCategory.value = cat
}

function handleToggleSelect(id: string) {
  toggleSelect(id)
  emit('selection-change', selected.value)
}

function handleSelectAll() {
  selectAll()
  emit('selection-change', selected.value)
}

function handleDeselectAll() {
  deselectAll()
  emit('selection-change', selected.value)
}

async function handleImport(folderPath: string) {
  if (textures.value.length === 0) return
  isScanning.value = true
  try {
    const result = await scanImportFolder(
      folderPath,
      textures.value.map((t) => t.id),
      textures.value.map((t) => t.name),
      textures.value.map((t) => t.width),
      textures.value.map((t) => t.height),
    )
    const textureById = new Map(textures.value.map((t) => [t.id, t]))
    importMatched.value = result.matched
      .filter((m) => textureById.has(m.textureId))
      .map((m) => ({
        texture: textureById.get(m.textureId) as import('@/types/index').Texture,
        sourcePath: m.sourcePath,
        previewUrl: m.previewUrl,
        sourceWidth: m.sourceWidth,
        sourceHeight: m.sourceHeight,
        hasDimensionMismatch: m.hasDimensionMismatch,
      }))
    importUnmatched.value = result.unmatched
    importDialogOpen.value = true
  } finally {
    isScanning.value = false
  }
}

function handleApplyImport(matched: MatchedTexture[]) {
  applyReplacements(matched)
}

onMounted(() => {
  init(props.mod)
})

onUnmounted(async () => {
  await cleanup()
})

const extractTargets = computed(() => textures.value.filter((t) => selected.value.has(t.id)))

defineExpose({
  CategoryTabs,
  ExtractDialog,
  ImportConfirmDialog,
  ImportDropZone,
  TextureCard,
  TrackHeroImages,
  Progress,
  extractDialogOpen,
  importDialogOpen,
  importMatched,
  importUnmatched,
  isScanning,
  extractTargets,
  showTrackHeroImages,
  categories,
  visibleTextures,
  progressPercent,
  selectedCount,
  activeCategory,
  selected,
  isDecoding,
  decodeProgress,
  handleCategoryChange,
  handleToggleSelect,
  handleSelectAll,
  handleDeselectAll,
  handleImport,
  handleApplyImport,
})
</script>

<template>
  <div class="flex flex-col h-full relative">
    <div v-if="isDecoding" class="px-3 py-1">
      <div class="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>{{ decodeProgress.label || 'Decoding…' }}</span>
        <span v-if="decodeProgress.total > 0">
          {{ decodeProgress.current }}/{{ decodeProgress.total }}
        </span>
      </div>
      <Progress :model-value="progressPercent" class="h-1" />
    </div>
    <div class="flex items-center gap-2 px-3 py-2 border-b">
      <CategoryTabs
        :categories="categories"
        :active="activeCategory"
        @change="handleCategoryChange"
      />
      <div class="ml-auto flex items-center gap-1">
        <span class="text-xs text-muted-foreground mr-1">{{ selectedCount }} selected</span>
        <button
          class="text-xs px-2 py-1 rounded border hover:bg-accent transition-colors"
          @click="handleSelectAll"
        >
          Select all
        </button>
        <button
          class="text-xs px-2 py-1 rounded border hover:bg-accent transition-colors"
          @click="handleDeselectAll"
        >
          Deselect all
        </button>
        <button
          v-if="extractTargets.length > 0"
          class="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="isDecoding"
          @click="extractDialogOpen = true"
        >
          Extract ({{ extractTargets.length }})
        </button>
      </div>
    </div>
    <div class="flex-1 overflow-auto pb-20">
      <TrackHeroImages v-if="showTrackHeroImages" :mod="mod" />
      <div class="grid grid-cols-4 gap-2 p-3">
        <TextureCard
          v-for="texture in visibleTextures"
          :key="texture.id"
          :texture="texture"
          :is-selected="selected.has(texture.id)"
          @toggle-select="handleToggleSelect(texture.id)"
        />
      </div>
      <div
        v-if="!isDecoding && visibleTextures.length === 0"
        class="flex items-center justify-center h-32 text-muted-foreground text-sm"
      >
        No textures in this category
      </div>
    </div>
    <div class="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-6 bg-gradient-to-t from-background via-background/90 to-transparent pointer-events-none">
      <div class="pointer-events-auto">
        <div v-if="isScanning" class="text-xs text-muted-foreground text-center py-2 rounded-lg border border-dashed border-border bg-background">
          Scanning…
        </div>
        <ImportDropZone v-else-if="!isDecoding" @import="handleImport" />
      </div>
    </div>
  </div>

  <ImportConfirmDialog
    v-model:is-open="importDialogOpen"
    :matched="importMatched"
    :unmatched="importUnmatched"
    @apply="handleApplyImport"
  />

  <ExtractDialog
    v-model:is-open="extractDialogOpen"
    :textures="extractTargets"
    :mod-path="mod.path"
    :mod-name="mod.meta.folderName"
  />
</template>
