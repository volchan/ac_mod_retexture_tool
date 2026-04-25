<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import CategoryBar from '@/components/texture/CategoryBar.vue'
import ExtractDialog from '@/components/texture/ExtractDialog.vue'
import ImportConfirmDialog from '@/components/texture/ImportConfirmDialog.vue'
import ImportDropZone from '@/components/texture/ImportDropZone.vue'
import TextureCard from '@/components/texture/TextureCard.vue'
import { Progress } from '@/components/ui/progress'
import Spinner from '@/components/ui/spinner/Spinner.vue'
import { useGlobalCommands } from '@/composables/useGlobalCommands'
import { useTextureFilter } from '@/composables/useTextureFilter'
import { useTextures } from '@/composables/useTextures'
import { openTexturePreviewWindow, scanImportFolder } from '@/lib/tauri'
import type {
  MatchedTexture,
  MatchedTextureRaw,
  Mod,
  Texture,
  TextureCategory,
  UnmatchedFile,
} from '@/types/index'

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

const DENSITY_TILE_WIDTH: Record<string, number> = { sm: 110, md: 150, lg: 200 }

const props = defineProps<{
  mod: Mod
}>()

const emit = defineEmits<{
  'selection-change': [selected: Set<string>]
  'focus-texture': [texture: Texture]
}>()

const {
  textures,
  selected,
  decodeProgress,
  isDecoding,
  init,
  restoreReplacements,
  setImportFolder,
  toggleSelect,
  selectAll,
  deselectAll,
  filteredTextures,
  applyReplacements,
  cleanup,
} = useTextures()

const { activeCategory, activeKn5Group, searchQuery, density } = useTextureFilter()

const extractDialogOpen = ref(false)
const importDialogOpen = ref(false)
const importMatched = ref<MatchedTexture[]>([])
const importUnmatched = ref<UnmatchedFile[]>([])
const isScanning = ref(false)
const collapsedGroups = ref<Set<string>>(new Set())

const categories = computed<TextureCategory[]>(() =>
  props.mod.modType === 'car' ? CAR_CATEGORIES : TRACK_CATEGORIES,
)

const tileWidth = computed(() => DENSITY_TILE_WIDTH[density.value] ?? 150)

const groupedTextures = computed<TextureGroup[]>(() => {
  const list = filteredTextures(activeCategory.value).filter((t) => {
    const matchesKn5 = activeKn5Group.value === 'all' || t.kn5File === activeKn5Group.value
    const matchesSearch =
      searchQuery.value === '' || t.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    return matchesKn5 && matchesSearch
  })

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
    const bucket = originMap.get(k) as Texture[]
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
const extractTargets = computed(() => textures.value.filter((t) => selected.value.has(t.id)))

function toggleGroupCollapsed(key: string) {
  const next = new Set(collapsedGroups.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  collapsedGroups.value = next
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

function handleFocusTexture(texture: Texture) {
  emit('focus-texture', texture)
}

async function handleImport(folderPath: string) {
  if (textures.value.length === 0) return
  setImportFolder(folderPath)
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
      .filter((m: MatchedTextureRaw) => textureById.has(m.textureId))
      .map((m: MatchedTextureRaw) => ({
        texture: textureById.get(m.textureId) as Texture,
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

async function handleOpenDetail(id: string) {
  const texture = textures.value.find((t) => t.id === id)
  if (texture) await openTexturePreviewWindow(texture, props.mod.path)
}

const { extractTick, importPath, importTick } = useGlobalCommands()

watch(extractTick, () => {
  if (textures.value.length > 0) extractDialogOpen.value = true
})

watch(importTick, () => {
  const path = importPath.value
  if (path) handleImport(path).catch((err) => console.error('[TexturePanel] Import failed:', err))
})

onMounted(async () => {
  await init(props.mod)
  // Yield to let any pending decode-texture IPC events flush before restoring
  await nextTick()
  await restoreReplacements(props.mod.path)
})

onUnmounted(async () => {
  await cleanup()
})

defineExpose({
  Spinner,
  CategoryBar,
  ExtractDialog,
  ImportConfirmDialog,
  ImportDropZone,
  TextureCard,
  Progress,
  handleOpenDetail,
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
  selected,
  isDecoding,
  decodeProgress,
  tileWidth,
  collapsedGroups,
  toggleGroupCollapsed,
  handleFocusTexture,
  handleToggleSelect,
  handleSelectAll,
  handleDeselectAll,
  handleImport,
  handleApplyImport,
  restoreReplacements,
  setImportFolder,
})
</script>

<template>
  <div class="flex flex-col h-full relative">
    <!-- Decode progress -->
    <div v-if="isDecoding" class="px-3 py-1.5 shrink-0">
      <div class="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
        <span class="flex items-center gap-1.5">
          <Spinner :size="11" />
          {{ decodeProgress.label || 'Decoding…' }}
        </span>
        <span v-if="decodeProgress.total > 0">
          {{ decodeProgress.current }}/{{ decodeProgress.total }}
        </span>
      </div>
      <Progress :model-value="progressPercent" class="h-0.5" />
    </div>

    <!-- Category / filter bar -->
    <CategoryBar
      :categories="categories"
      :selected-count="selectedCount"
      @select-all="handleSelectAll"
      @deselect-all="handleDeselectAll"
      @extract="extractDialogOpen = true"
    />

    <!-- Texture grid -->
    <div class="flex-1 overflow-auto pb-4">
      <template v-for="group in groupedTextures" :key="group.key">
        <!-- Group header -->
        <button
          class="sticky top-0 z-10 w-full flex items-center gap-2 px-3.5 py-1.5 bg-background/95 backdrop-blur-sm border-b border-border/50 text-left"
          @click="toggleGroupCollapsed(group.key)"
        >
          <span class="text-[12px] font-medium text-muted-foreground font-mono truncate">{{ group.label }}</span>
          <span class="text-[10px] text-muted-foreground/60 shrink-0">{{ group.textures.length }}</span>
          <span
            v-if="group.textures.some((t) => t.replacement)"
            class="text-[9.5px] font-medium px-1.5 py-px rounded bg-[var(--accent-muted)] text-[var(--accent-text)] border border-[var(--accent-border)] shrink-0"
          >
            {{ group.textures.filter((t) => t.replacement).length }} queued
          </span>
        </button>

        <!-- Grid -->
        <div
          v-if="!collapsedGroups.has(group.key)"
          class="p-3"
          :style="`display: grid; grid-template-columns: repeat(auto-fill, minmax(${tileWidth}px, 1fr)); gap: 10px;`"
        >
          <TextureCard
            v-for="texture in group.textures"
            :key="texture.id"
            :texture="texture"
            :is-selected="selected.has(texture.id)"
            :density="density"
            @toggle-select="handleToggleSelect(texture.id)"
            @open-detail="handleOpenDetail(texture.id)"
            @click.stop="handleFocusTexture(texture)"
          />
        </div>
      </template>

      <div
        v-if="!isDecoding && visibleTextureCount === 0"
        class="flex items-center justify-center h-32 text-muted-foreground text-[13px]"
      >
        No textures in this category
      </div>
    </div>

    <!-- Import drop zone (bottom) -->
    <div class="shrink-0 pt-1 border-t">
      <div v-if="isScanning" class="text-[12px] text-muted-foreground text-center py-2 mx-3.5 rounded-lg border border-dashed border-border">
        Scanning…
      </div>
      <ImportDropZone v-else-if="!isDecoding" @import="handleImport" />
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
