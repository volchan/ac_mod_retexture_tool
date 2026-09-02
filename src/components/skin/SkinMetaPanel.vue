<script setup lang="ts">
import { watch } from 'vue'
import { useMod } from '@/composables/useMod'
import { useSkinMeta } from '@/composables/useSkinMeta'

const { activeSkin } = useMod()
const { meta, openedFolderName, isFork, folderNameError, load, reset } = useSkinMeta()

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

defineExpose({ meta, openedFolderName, isFork, folderNameError, FIELDS })
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
  </section>
</template>
