<script setup lang="ts">
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { PenToolIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { useTextureDetail } from '@/composables/useTextureDetail'
import { requestLiveryEditor } from '@/lib/tauri'

const { activeTexture } = useTextureDetail()

const canEdit = computed(() => activeTexture.value !== null)

/// This panel runs in its own webview window, which holds neither the texture list
/// nor the replacement state, so the editor has to open in the main window.
async function openEditor() {
  const texture = activeTexture.value
  if (!texture) return
  await requestLiveryEditor(texture.id)
  // Closing is a courtesy so the editor is not left behind this window; the editor
  // is already on its way either way.
  await getCurrentWebviewWindow()
    .close()
    .catch(() => {})
}

defineExpose({ activeTexture, canEdit, openEditor, Button, PenToolIcon })
</script>

<template>
  <div class="flex flex-col gap-5 p-4 overflow-y-auto bg-muted/30 w-72 shrink-0">
    <Button class="w-full" :disabled="!canEdit" @click="openEditor">
      <PenToolIcon class="size-4" />
      Edit livery
    </Button>

    <div>
      <p class="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Texture</p>
      <p class="text-sm font-medium font-mono break-all">{{ activeTexture?.name ?? '—' }}</p>
    </div>

    <div>
      <p class="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Dimensions</p>
      <p class="text-sm">
        {{ activeTexture ? `${activeTexture.width}×${activeTexture.height}` : '—' }}
      </p>
    </div>

    <div>
      <p class="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Format</p>
      <span class="text-xs font-mono px-1.5 py-0.5 rounded bg-muted border">
        {{ activeTexture?.format ?? '—' }}
      </span>
    </div>

    <div>
      <p class="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Source</p>
      <p class="text-xs font-mono break-all text-muted-foreground">
        {{ activeTexture?.kn5File ?? activeTexture?.skinFolder ?? '—' }}
      </p>
    </div>

    <div
      v-if="activeTexture?.replacement"
      class="rounded-md border border-amber-500/40 bg-amber-50/5 p-3 space-y-1.5"
    >
      <p class="text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
        Replacement
      </p>
      <p class="text-xs font-mono break-all text-muted-foreground">
        {{ activeTexture.replacement.sourcePath }}
      </p>
      <p class="text-xs text-muted-foreground">
        {{ activeTexture.replacement.width }}×{{ activeTexture.replacement.height }}
      </p>
    </div>
  </div>
</template>
