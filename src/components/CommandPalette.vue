<script setup lang="ts">
import {
  CheckIcon,
  CommandIcon,
  DownloadIcon,
  FilterIcon,
  FolderOpenIcon,
  ListIcon,
  MoonIcon,
  PackageIcon,
  UploadIcon,
} from 'lucide-vue-next'
import { type Component, computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useTextureFilter } from '@/composables/useTextureFilter'
import { useTextures } from '@/composables/useTextures'
import { modKbd } from '@/lib/platform'
import type { TextureCategory } from '@/types/index'

const emit = defineEmits<{
  close: []
  repack: []
  extract: []
  import: []
  queue: []
  'switch-mod': []
  'toggle-theme': []
}>()

interface PaletteItem {
  id: string
  label: string
  kbd?: string
  group: string
  icon: Component
  action: () => void
}

const { selectAll, deselectAll } = useTextures()
const { setCategory } = useTextureFilter()

const query = ref('')
const activeIdx = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

const allItems: PaletteItem[] = [
  {
    id: 'extract',
    label: 'Extract selected textures',
    kbd: modKbd('E'),
    group: 'Actions',
    icon: DownloadIcon,
    action: () => {
      emit('extract')
      emit('close')
    },
  },
  {
    id: 'import',
    label: 'Import replacement PNGs',
    kbd: modKbd('I'),
    group: 'Actions',
    icon: UploadIcon,
    action: () => {
      emit('import')
      emit('close')
    },
  },
  {
    id: 'repack',
    label: 'Repack mod as .zip',
    kbd: modKbd('R'),
    group: 'Actions',
    icon: PackageIcon,
    action: () => {
      emit('repack')
      emit('close')
    },
  },
  {
    id: 'select-all',
    label: 'Select all textures',
    kbd: modKbd('A'),
    group: 'Selection',
    icon: CheckIcon,
    action: () => {
      selectAll()
      emit('close')
    },
  },
  {
    id: 'deselect',
    label: 'Deselect all',
    group: 'Selection',
    icon: CheckIcon,
    action: () => {
      deselectAll()
      emit('close')
    },
  },
  {
    id: 'queue',
    label: 'View replacement queue',
    group: 'Navigation',
    icon: ListIcon,
    action: () => {
      emit('queue')
      emit('close')
    },
  },
  {
    id: 'switch-mod',
    label: 'Switch mod…',
    group: 'Navigation',
    icon: FolderOpenIcon,
    action: () => {
      emit('switch-mod')
      emit('close')
    },
  },
  ...(['road', 'terrain', 'buildings', 'props', 'sky', 'other'] as TextureCategory[]).map(
    (cat) => ({
      id: `filter-${cat}`,
      label: `Filter: ${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
      group: 'Filters',
      icon: FilterIcon,
      action: () => {
        setCategory(cat)
        emit('close')
      },
    }),
  ),
  {
    id: 'theme',
    label: 'Toggle dark mode',
    group: 'Preferences',
    icon: MoonIcon,
    action: () => {
      emit('toggle-theme')
      emit('close')
    },
  },
]

const filtered = computed(() => {
  const q = query.value.toLowerCase()
  return q ? allItems.filter((i) => i.label.toLowerCase().includes(q)) : allItems
})

const grouped = computed(() => {
  const map = new Map<string, PaletteItem[]>()
  for (const item of filtered.value) {
    const list = map.get(item.group) ?? []
    list.push(item)
    map.set(item.group, list)
  }
  return [...map.entries()]
})

const flatFiltered = computed(() => filtered.value)

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = Math.min(activeIdx.value + 1, flatFiltered.value.length - 1)
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = Math.max(activeIdx.value - 1, 0)
  }
  if (e.key === 'Enter') {
    flatFiltered.value[activeIdx.value]?.action()
  }
}

onMounted(async () => {
  await nextTick()
  inputEl.value?.focus()
  window.addEventListener('keydown', handleKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKey)
})

defineExpose({
  CommandIcon,
  query,
  activeIdx,
  inputEl,
  grouped,
  flatFiltered,
  handleKey,
  modKbd,
})
</script>

<template>
  <div
    class="fixed inset-0 bg-black/35 backdrop-blur-sm flex items-start justify-center pt-[12vh] z-50"
    @click.self="$emit('close')"
  >
    <div class="w-[520px] bg-card border border-border/80 rounded-xl overflow-hidden shadow-2xl">
      <!-- Search input -->
      <div class="flex items-center gap-2.5 px-3.5 py-3 border-b">
        <CommandIcon :size="14" class="text-muted-foreground shrink-0" />
        <input
          ref="inputEl"
          v-model="query"
          type="text"
          placeholder="Type a command…"
          class="flex-1 bg-transparent border-none outline-none text-[14px] text-foreground placeholder:text-muted-foreground"
          @input="activeIdx = 0"
        />
        <kbd class="font-mono text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground border border-border font-medium">
          Esc
        </kbd>
      </div>

      <!-- Items -->
      <div class="max-h-[340px] overflow-auto p-1.5">
        <template v-for="[group, items] in grouped" :key="group">
          <div class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2.5 pt-2 pb-1">
            {{ group }}
          </div>
          <button
            v-for="item in items"
            :key="item.id"
            class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-[13px] text-foreground text-left cursor-pointer transition-colors"
            :class="flatFiltered.indexOf(item) === activeIdx ? 'bg-muted' : 'hover:bg-muted/60'"
            @click="item.action()"
            @mouseenter="activeIdx = flatFiltered.indexOf(item)"
          >
            <component :is="item.icon" :size="13" class="text-muted-foreground shrink-0" />
            <span class="flex-1">{{ item.label }}</span>
            <kbd
              v-if="item.kbd"
              class="font-mono text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground border border-border font-medium"
            >{{ item.kbd }}</kbd>
          </button>
        </template>
        <div v-if="flatFiltered.length === 0" class="py-8 text-center text-muted-foreground text-[12px]">
          No results for "{{ query }}"
        </div>
      </div>
    </div>
  </div>
</template>
