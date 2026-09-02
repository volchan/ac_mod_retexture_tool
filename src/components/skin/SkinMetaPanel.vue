<script setup lang="ts">
import { watch } from 'vue'
import { useMod } from '@/composables/useMod'
import { useSkinMeta } from '@/composables/useSkinMeta'

const { activeSkin } = useMod()
const { meta, openedFolderName, exportFull, isFork, incompleteFork, folderNameError, load, reset } =
  useSkinMeta()

const emit = defineEmits<{ 'export-skin': [] }>()

watch(
  activeSkin,
  (skin) => {
    if (skin) load(skin)
    else reset()
  },
  { immediate: true },
)

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
  isFork,
  incompleteFork,
  folderNameError,
  FIELDS,
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
      />
    </label>

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
        :disabled="folderNameError != null"
        @click="emit('export-skin')"
      >
        Export skin
      </button>
    </div>
  </section>
</template>
