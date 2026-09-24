<script setup lang="ts">
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useMod } from '@/composables/useMod'
import { PREVIEW_SIZE, useSkinArt } from '@/composables/useSkinArt'
import { useSkinMeta } from '@/composables/useSkinMeta'
import { captureSkinPreview } from '@/composables/useSkinPreviewShot'
import { useTextures } from '@/composables/useTextures'

const { mod, activeSkin } = useMod()
const { badgeColours, badgeError, paintBadge, saveBadge, savePreview, isSaving } = useSkinArt()
const { textures } = useTextures()
const {
  meta,
  openedFolderName,
  exportFull,
  isExporting,
  isFork,
  incompleteFork,
  folderNameError,
  load,
  reset,
  syncFolderToNumber,
} = useSkinMeta()

const emit = defineEmits<{ 'export-skin': [] }>()

watch(
  activeSkin,
  (skin) => {
    if (skin) load(skin)
    else reset()
  },
  { immediate: true },
)

const badge = ref<HTMLCanvasElement | null>(null)
/// Building the car for the preview takes seconds and writes nothing while it
/// runs, so the button has to say so on its own.
const isCapturing = ref(false)

/// Redrawn from the colours the livery wears and the number as it is typed, so
/// the sidebar shows what AC's entry list will show rather than a stale file.
watch(
  [badge, badgeColours, () => meta.value?.number],
  ([canvas, , raceNumber]) => {
    if (canvas) paintBadge(canvas, raceNumber ?? '')
  },
  { immediate: true },
)

/// The number is the one field that renames the folder, so it is the only one
/// whose edits go anywhere but straight into the form.
function onFieldInput(key: (typeof FIELDS)[number]['key']) {
  if (key === 'number' && meta.value) syncFolderToNumber(meta.value.number)
}

/// Writes both images AC shows for a skin. The badge is drawn from the colours
/// already sampled; the preview needs the car built and photographed, which is
/// why this waits on a render nothing else asked for.
async function saveArtToSkin() {
  const carPath = mod.value?.path
  const skin = activeSkin.value?.name
  if (!carPath || !skin) return

  try {
    await saveBadge(carPath, skin, meta.value?.number ?? '')
    toast.success('Saved this skin\u2019s badge')
  } catch (e) {
    toast.error('Could not save the badge', {
      description: e instanceof Error ? e.message : String(e),
    })
    return
  }

  // Reported apart from the badge: the badge is already on disk by here, and a
  // failed render must not read as nothing having been written.
  isCapturing.value = true
  try {
    const { shot, failed } = await captureSkinPreview(carPath, skin, textures.value, PREVIEW_SIZE)
    await savePreview(carPath, skin, shot)

    if (failed.length > 0) {
      toast.warning(`Saved the preview with ${failed.length} textures missing`, {
        description: failed.join(', '),
      })
    } else {
      toast.success('Saved this skin\u2019s preview')
    }
  } catch (e) {
    toast.error('Could not save the preview', {
      description: e instanceof Error ? e.message : String(e),
    })
  } finally {
    isCapturing.value = false
  }
}

const FIELDS = [
  { key: 'skinName', label: 'Skin name', placeholder: 'Rosso Corsa' },
  { key: 'driverName', label: 'Driver', placeholder: '' },
  { key: 'team', label: 'Team', placeholder: '' },
  { key: 'number', label: 'Number', placeholder: '' },
  { key: 'country', label: 'Country', placeholder: '' },
] as const

defineExpose({
  meta,
  openedFolderName,
  exportFull,
  isExporting,
  isFork,
  incompleteFork,
  folderNameError,
  FIELDS,
  badge,
  badgeError,
  isSaving,
  isCapturing,
  onFieldInput,
  saveArtToSkin,
  emit,
})
</script>

<template>
  <section v-if="meta">
    <p class="text-[10.5px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
      Skin
    </p>

    <label class="block mb-2">
      <span class="text-[11px] text-muted-foreground">Folder</span>
      <input
        v-model="meta.folderName"
        class="w-full mt-0.5 px-2 py-1 text-[12px] font-mono rounded-[5px] border bg-background"
        :class="folderNameError ? 'border-destructive' : 'border-border'"
        aria-label="Skin folder"
      />
      <span v-if="folderNameError" class="text-[10.5px] text-destructive">
        {{ folderNameError }}
      </span>
      <span v-else-if="isFork" class="text-[10.5px] text-muted-foreground">
        Exports as a new skin. {{ openedFolderName }} stays untouched.
      </span>
      <span v-else class="text-[10.5px] text-muted-foreground">Updates this skin.</span>
    </label>

    <label v-for="field in FIELDS" :key="field.key" class="block mb-1.5">
      <span class="text-[11px] text-muted-foreground">{{ field.label }}</span>
      <input
        v-model="meta[field.key]"
        :placeholder="field.placeholder"
        class="w-full mt-0.5 px-2 py-1 text-[12px] rounded-[5px] border border-border bg-background"
        :aria-label="field.label"
        @input="onFieldInput(field.key)"
      />
    </label>

    <div class="mt-3 flex items-center gap-2.5">
      <canvas
        ref="badge"
        class="size-[52px] shrink-0 rounded-[5px] border border-border"
        aria-label="Entry list badge"
      />
      <div class="min-w-0">
        <p class="text-[11px] text-muted-foreground">Entry list badge</p>
        <p v-if="badgeError" class="text-[10.5px] text-destructive">
          Grey: {{ badgeError }}
        </p>
        <button
          class="text-[11px] font-medium underline underline-offset-2 disabled:opacity-50"
          :disabled="isSaving || isCapturing || !activeSkin"
          @click="saveArtToSkin"
        >
          {{ isCapturing ? 'Rendering\u2026' : isSaving ? 'Saving\u2026' : 'Save badge and preview' }}
        </button>
      </div>
    </div>

    <div class="mt-3 pt-3 border-t border-border">
      <label class="flex items-center gap-2 text-[12px] mb-1">
        <input v-model="exportFull" type="checkbox" aria-label="Ship the whole skin" />
        Ship the whole skin
      </label>
      <p class="text-[10.5px] text-muted-foreground mb-2">
        {{
          exportFull
            ? 'Every file, installs on its own.'
            : 'Only what changed, layered onto a skin the player already has.'
        }}
      </p>

      <p v-if="incompleteFork" class="text-[10.5px] text-destructive mb-2">
        A renamed skin has nothing to layer onto — ship the whole skin instead.
      </p>

      <button
        class="w-full py-1.5 text-[12px] font-medium rounded-[6px] bg-primary text-primary-foreground disabled:opacity-50"
        :disabled="folderNameError != null || isExporting"
        aria-label="Export skin"
        @click="emit('export-skin')"
      >
        {{ isExporting ? 'Packing…' : 'Export skin' }}
      </button>
    </div>
  </section>
</template>
