<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import CategoryTabs from '@/components/texture/CategoryTabs.vue'
import ExtractDialog from '@/components/texture/ExtractDialog.vue'
import ImportConfirmDialog from '@/components/texture/ImportConfirmDialog.vue'
import ImportDropZone from '@/components/texture/ImportDropZone.vue'
import TextureCard from '@/components/texture/TextureCard.vue'
import { Progress } from '@/components/ui/progress'
import { useTextures } from '@/composables/useTextures'
import { scanImportFolder } from '@/lib/tauri'
import type { MatchedTexture, Mod, Texture, TextureCategory, UnmatchedFile } from '@/types/index'

interface TextureGroup {
  key: string
  label: string
  textures: Texture[]
}

const CAR_CATEGORIES: TextureCategory[] = ['all', 'body', 'livery', 'interior', 'wheels', 'other']
const TRACK_CATEGORIES: TextureCategory[] = [
  'all',
  'road',
  'terrain',
  'buildings',
  'props',
  'sky',
  'other',
  'preview',
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

const groupedTextures = computed<TextureGroup[]>(() => {
  const list = filteredTextures(activeCategory.value)

  const heroTextures = list.filter((t) => t.category === 'preview')
  const normalTextures = list.filter((t) => t.category !== 'preview')

  const originMap = new Map<string, Texture[]>()
  for (const t of normalTextures) {
    const key = t.kn5File ?? t.skinFolder ?? '__other__'
    if (!originMap.has(key)) originMap.set(key, [])
    const bucket = originMap.get(key)
    if (bucket) bucket.push(t)
  }

  const sortedOriginKeys = [...originMap.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )

  const groups: TextureGroup[] = []

  if (heroTextures.length > 0) {
    const sorted = [...heroTextures].sort((a, b) => a.name.localeCompare(b.name))
    groups.push({ key: '__hero__', label: 'Preview images', textures: sorted })
  }

  for (const k of sortedOriginKeys) {
    const bucket = originMap.get(k) ?? []
    const sorted = [...bucket].sort((a, b) => a.name.localeCompare(b.name))
    groups.push({ key: k, label: k === '__other__' ? 'Other' : k, textures: sorted })
  }

  return groups
})

const visibleTextureCount = computed(() =>
  groupedTextures.value.reduce((sum, g) => sum + g.textures.length, 0),
)

const progressPercent = computed(() => {
  if (decodeProgress.value.total === 0) return 0
  return (decodeProgress.value.current / decodeProgress.value.total) * 100
})

const selectedCount = computed(() => selected.value.size)

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
      props.mod.path,
      textures.value.map((t) => t.id),
      textures.value.map((t) => t.name),
      textures.value.map((t) => t.width),
      textures.value.map((t) => t.height),
      textures.value.map((t) => (t.source === 'kn5' ? t.path : t.skinFolder ? '' : t.path)),
      textures.value.map((t) => t.skinFolder ?? ''),
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
  Progress,
  extractDialogOpen,
  importDialogOpen,
  importMatched,
  importUnmatched,
  isScanning,
  extractTargets,
  categories,
  groupedTextures,
  visibleTextureCount,
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
      <template v-for="group in groupedTextures" :key="group.key">
        <div
          class="sticky top-0 z-10 px-3 py-1.5 bg-background/95 backdrop-blur-sm border-b border-border/50 flex items-center gap-2"
        >
          <span class="text-xs font-medium text-muted-foreground truncate">{{ group.label }}</span>
          <span class="text-[10px] text-muted-foreground/60 shrink-0">{{ group.textures.length }}</span>
        </div>
        <div class="grid grid-cols-4 gap-2 p-3">
          <TextureCard
            v-for="texture in group.textures"
            :key="texture.id"
            :texture="texture"
            :is-selected="selected.has(texture.id)"
            @toggle-select="handleToggleSelect(texture.id)"
          />
        </div>
      </template>
      <div
        v-if="!isDecoding && visibleTextureCount === 0"
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
