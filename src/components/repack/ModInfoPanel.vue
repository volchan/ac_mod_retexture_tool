<script setup lang="ts">
import { ArchiveIcon, RotateCcwIcon } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useTextures } from '@/composables/useTextures'
import { heroLabel } from '@/lib/utils'
import type { Mod } from '@/types/index'

const props = defineProps<{
  mod: Mod
}>()

const emit = defineEmits<{
  repack: []
}>()

const { textures } = useTextures()

const name = ref(props.mod.meta.name)
const folderName = ref(props.mod.meta.folderName)
const author = ref(props.mod.meta.author)
const version = ref(props.mod.meta.version)
const description = ref(props.mod.meta.description)

const brand = ref(props.mod.carMeta?.brand ?? '')
const carClass = ref(props.mod.carMeta?.carClass ?? '')
const bhp = ref(props.mod.carMeta?.bhp ?? 0)
const weight = ref(props.mod.carMeta?.weight ?? 0)

const country = ref(props.mod.trackMeta?.country ?? '')

const folderNameChanged = computed(() => folderName.value.trim() !== props.mod.meta.folderName)

const replaced = computed(() => textures.value.filter((t) => t.replacement != null))

const replacementCount = computed(() => replaced.value.length)

const replacementByKn5 = computed(() => {
  const map = new Map<string, number>()
  for (const t of replaced.value) {
    const key =
      t.category === 'loadingScreen' ? heroLabel(t.name) : (t.kn5File ?? t.skinFolder ?? 'other')
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

watch(
  () => props.mod,
  (mod) => {
    name.value = mod.meta.name
    folderName.value = mod.meta.folderName
    author.value = mod.meta.author
    version.value = mod.meta.version
    description.value = mod.meta.description
    brand.value = mod.carMeta?.brand ?? ''
    carClass.value = mod.carMeta?.carClass ?? ''
    bhp.value = mod.carMeta?.bhp ?? 0
    weight.value = mod.carMeta?.weight ?? 0
    country.value = mod.trackMeta?.country ?? ''
  },
)

function reset() {
  name.value = props.mod.meta.name
  folderName.value = props.mod.meta.folderName
  author.value = props.mod.meta.author
  version.value = props.mod.meta.version
  description.value = props.mod.meta.description
  brand.value = props.mod.carMeta?.brand ?? ''
  carClass.value = props.mod.carMeta?.carClass ?? ''
  bhp.value = props.mod.carMeta?.bhp ?? 0
  weight.value = props.mod.carMeta?.weight ?? 0
  country.value = props.mod.trackMeta?.country ?? ''
}

defineExpose({
  ArchiveIcon,
  RotateCcwIcon,
  Input,
  Label,
  Textarea,
  emit,
  name,
  folderName,
  author,
  version,
  description,
  brand,
  carClass,
  bhp,
  weight,
  country,
  folderNameChanged,
  replaced,
  replacementCount,
  replacementByKn5,
  mismatchCount,
  reset,
})
</script>

<template>
  <div class="flex flex-col gap-4 pb-4">
    <section>
      <p class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">General</p>
      <div class="space-y-2">
        <div>
          <Label class="text-[11px] text-muted-foreground">Display name</Label>
          <Input v-model="name" class="mt-0.5 h-7 text-xs" />
        </div>
        <div>
          <Label class="text-[11px] text-muted-foreground">Folder name</Label>
          <Input
            v-model="folderName"
            class="mt-0.5 h-7 text-xs font-mono"
            :class="folderNameChanged ? 'border-amber-500 focus-visible:ring-amber-500/30' : ''"
          />
          <p v-if="folderNameChanged" class="text-[10px] text-amber-600 mt-0.5">
            Renaming the folder will change the mod's install path.
          </p>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <Label class="text-[11px] text-muted-foreground">Author</Label>
            <Input v-model="author" class="mt-0.5 h-7 text-xs" />
          </div>
          <div>
            <Label class="text-[11px] text-muted-foreground">Version</Label>
            <Input v-model="version" class="mt-0.5 h-7 text-xs" />
          </div>
        </div>
        <div>
          <Label class="text-[11px] text-muted-foreground">Description</Label>
          <Textarea v-model="description" class="mt-0.5 text-xs resize-none" rows="3" />
        </div>
      </div>
    </section>

    <section v-if="mod.modType === 'car'">
      <p class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Car details</p>
      <div class="space-y-2">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <Label class="text-[11px] text-muted-foreground">Brand</Label>
            <Input v-model="brand" class="mt-0.5 h-7 text-xs" />
          </div>
          <div>
            <Label class="text-[11px] text-muted-foreground">Class</Label>
            <Input v-model="carClass" class="mt-0.5 h-7 text-xs" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <Label class="text-[11px] text-muted-foreground">BHP</Label>
            <Input v-model.number="bhp" type="number" class="mt-0.5 h-7 text-xs" />
          </div>
          <div>
            <Label class="text-[11px] text-muted-foreground">Weight (kg)</Label>
            <Input v-model.number="weight" type="number" class="mt-0.5 h-7 text-xs" />
          </div>
        </div>
      </div>
    </section>

    <section v-if="mod.modType === 'track'">
      <p class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Track details</p>
      <div class="space-y-2">
        <div>
          <Label class="text-[11px] text-muted-foreground">Country</Label>
          <Input v-model="country" class="mt-0.5 h-7 text-xs" />
        </div>
      </div>
    </section>

    <section v-if="replacementCount > 0" class="rounded-md border border-border bg-background px-3 py-2.5 space-y-2">
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
          <span class="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">{{ file }}</span>
          <span class="text-[10px] text-muted-foreground shrink-0 ml-2">{{ count }}</span>
        </div>
      </div>
      <p v-if="mismatchCount > 0" class="text-[10px] text-amber-600">
        {{ mismatchCount }} texture{{ mismatchCount !== 1 ? 's have' : ' has' }} different dimensions — may cause visual issues in-game.
      </p>
    </section>

    <div class="flex gap-2 mt-auto">
      <button
        class="flex items-center gap-1.5 text-xs px-3 py-2 rounded border hover:bg-accent transition-colors"
        @click="reset"
      >
        <RotateCcwIcon :size="12" />
        Reset
      </button>
      <button
        class="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        @click="emit('repack')"
      >
        <ArchiveIcon :size="12" />
        Repack as .7z
      </button>
    </div>
  </div>
</template>
