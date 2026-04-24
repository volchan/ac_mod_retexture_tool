<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AcInstallHeader from '@/components/library/AcInstallHeader.vue'
import DetectingScreen from '@/components/library/DetectingScreen.vue'
import InstalledModCard from '@/components/library/InstalledModCard.vue'
import LibraryFilterBar from '@/components/library/LibraryFilterBar.vue'
import NotFoundScreen from '@/components/library/NotFoundScreen.vue'
import { useAcDetection } from '@/composables/useAcDetection'
import { useAcLibrary } from '@/composables/useAcLibrary'
import { useLibrary } from '@/composables/useLibrary'
import { isWindows } from '@/lib/platform'
import type { ModType } from '@/types/index'

const emit = defineEmits<{ open: [path: string] }>()

const { phase, install, installInfo, probes, pickManually, rescan, changeLocation, init } =
  useAcDetection()
const { entries, isScanning, scannedCount, scanLibrary, getFiltered } = useAcLibrary()
const { recentMods } = useLibrary()

const typeFilter = ref<'all' | ModType>('all')
const sourceFilter = ref<'all' | 'kunos' | 'mods'>('all')
const query = ref('')
const sortBy = ref<'name' | 'textures'>('name')

const filtered = computed(() =>
  getFiltered(query.value, typeFilter.value, sourceFilter.value, sortBy.value),
)

watch(
  () => install.value?.path,
  (path) => {
    if (path) scanLibrary(path)
  },
)

onMounted(() => init())

defineExpose({
  AcInstallHeader,
  DetectingScreen,
  InstalledModCard,
  LibraryFilterBar,
  NotFoundScreen,
  phase,
  install,
  installInfo,
  probes,
  entries,
  isScanning,
  scannedCount,
  filtered,
  typeFilter,
  sourceFilter,
  query,
  sortBy,
  isWindows,
  recentMods,
  pickManually,
  rescan,
  changeLocation,
  emit,
})
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <DetectingScreen
      v-if="phase === 'detecting'"
      :probes="probes"
      @pick-manually="pickManually"
    />

    <NotFoundScreen
      v-else-if="phase === 'not_found'"
      :is-windows="isWindows"
      @browse="pickManually"
      @rescan="rescan"
    />

    <template v-else-if="phase === 'detected' && install && installInfo">
      <AcInstallHeader
        :install="install"
        :install-info="installInfo"
        :is-windows="isWindows"
        @rescan="rescan"
        @change="changeLocation"
      />

      <LibraryFilterBar
        :total="entries.length"
        :shown="filtered.length"
        :type-filter="typeFilter"
        :source-filter="sourceFilter"
        :query="query"
        :sort-by="sortBy"
        @update:type-filter="typeFilter = $event"
        @update:source-filter="sourceFilter = $event"
        @update:query="query = $event"
        @update:sort-by="sortBy = $event"
      />

      <div class="flex-1 overflow-auto px-7 py-5">
        <div v-if="isScanning" class="text-[12px] text-muted-foreground mb-4">
          Scanning… {{ scannedCount }} found
        </div>

        <template
          v-if="recentMods.length > 0 && query === '' && typeFilter === 'all' && sourceFilter === 'all'"
        >
          <div class="flex items-center gap-2.5 mb-2.5">
            <span
              class="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0"
              >Recent</span
            >
            <div class="flex-1 h-px bg-border" />
          </div>
          <div class="flex gap-2.5 overflow-x-auto pb-1 mb-6">
            <button
              v-for="m in recentMods.slice(0, 5)"
              :key="m.id"
              class="shrink-0 w-[220px] p-3 text-left bg-card border border-border rounded-[9px] cursor-pointer hover:border-[var(--accent-border)] transition-all"
              @click="emit('open', m.path)"
            >
              <div class="flex items-center gap-1.5 mb-2">
                <span
                  class="text-[10.5px] font-medium px-1.5 py-px rounded border"
                  :class="
                    m.modType === 'car'
                      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
                      : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
                  "
                  >{{ m.modType === 'car' ? 'Car' : 'Track' }}</span
                >
                <div class="flex-1" />
              </div>
              <div class="text-[13px] font-semibold mb-0.5 truncate">{{ m.name }}</div>
              <div class="text-[10.5px] font-mono text-muted-foreground truncate">
                {{ m.folderName }}
              </div>
            </button>
          </div>
        </template>

        <template v-for="groupType in (['car', 'track'] as ModType[])" :key="groupType">
          <template v-if="filtered.filter((m) => m.modType === groupType).length > 0">
            <template v-if="filtered.filter((m) => m.modType === groupType && !m.isKunos).length > 0">
              <div
                class="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--accent-text)] mb-2 mt-5 first:mt-0"
              >
                {{ groupType === 'car' ? 'Cars' : 'Tracks' }} — Mods ·
                {{ filtered.filter((m) => m.modType === groupType && !m.isKunos).length }}
              </div>
              <div class="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(260px,1fr))] mb-4">
                <InstalledModCard
                  v-for="entry in filtered.filter((m) => m.modType === groupType && !m.isKunos)"
                  :key="entry.id"
                  :entry="entry"
                  @open="emit('open', entry.path)"
                />
              </div>
            </template>

            <template
              v-if="
                sourceFilter !== 'mods' &&
                filtered.filter((m) => m.modType === groupType && m.isKunos).length > 0
              "
            >
              <div
                class="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground mb-2 mt-5 first:mt-0"
              >
                {{ groupType === 'car' ? 'Cars' : 'Tracks' }} — Kunos ·
                {{ filtered.filter((m) => m.modType === groupType && m.isKunos).length }}
              </div>
              <div class="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(260px,1fr))] mb-4">
                <InstalledModCard
                  v-for="entry in filtered.filter((m) => m.modType === groupType && m.isKunos)"
                  :key="entry.id"
                  :entry="entry"
                  @open="emit('open', entry.path)"
                />
              </div>
            </template>
          </template>
        </template>

        <div
          v-if="filtered.length === 0 && !isScanning"
          class="py-12 text-center text-muted-foreground"
        >
          <div class="text-[13px] mb-1">No mods match these filters</div>
          <div class="text-[11px]">Try changing the type or source filter.</div>
        </div>
      </div>
    </template>
  </div>
</template>
