<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import CategoryTabs from '@/components/texture/CategoryTabs.vue'
import ExtractDialog from '@/components/texture/ExtractDialog.vue'
import TextureCard from '@/components/texture/TextureCard.vue'
import TrackHeroImages from '@/components/texture/TrackHeroImages.vue'
import { Progress } from '@/components/ui/progress'
import { useTextures } from '@/composables/useTextures'
import type { Mod, TextureCategory } from '@/types/index'

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
  cleanup,
} = useTextures()

const activeCategory = ref<TextureCategory>('all')
const extractDialogOpen = ref(false)

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
  TextureCard,
  TrackHeroImages,
  Progress,
  extractDialogOpen,
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
})
</script>

<template>
  <div class="flex flex-col h-full">
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
    <div class="flex-1 overflow-auto">
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
  </div>

  <ExtractDialog
    v-model:is-open="extractDialogOpen"
    :textures="extractTargets"
    :mod-path="mod.path"
    :mod-name="mod.meta.folderName"
  />
</template>
