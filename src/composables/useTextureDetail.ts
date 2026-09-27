import { computed, ref } from 'vue'
import { loadTextureImage } from '@/lib/textureImage'
import type { Texture } from '@/types/index'

const activeTextureId = ref<string | null>(null)
const visibleList = ref<Texture[]>([])
const activeTab = ref<'original' | 'replacement'>('original')
const originalDataUrl = ref<string | null>(null)
const isLoadingOriginal = ref(false)
const loadError = ref<string | null>(null)
const modPath = ref<string | null>(null)

export function useTextureDetail() {
  const activeTexture = computed<Texture | null>(
    () => visibleList.value.find((t) => t.id === activeTextureId.value) ?? null,
  )

  const activeIndex = computed(() =>
    visibleList.value.findIndex((t) => t.id === activeTextureId.value),
  )

  const hasPrev = computed(() => activeIndex.value > 0)
  const hasNext = computed(() => activeIndex.value < visibleList.value.length - 1)

  async function loadOriginal(capturedId: string) {
    loadError.value = null
    const tex = visibleList.value.find((t) => t.id === capturedId)
    if (!tex) {
      isLoadingOriginal.value = false
      originalDataUrl.value = null
      loadError.value = 'Texture not found'
      return
    }

    isLoadingOriginal.value = true
    // Yield once so the loading state paints before a large decode blocks the thread.
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (activeTextureId.value !== capturedId) return

    try {
      const dataUrl = await loadTextureImage(tex, modPath.value)
      if (activeTextureId.value !== capturedId) return
      originalDataUrl.value = dataUrl
      loadError.value = null
    } catch (e) {
      if (activeTextureId.value !== capturedId) return
      loadError.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (activeTextureId.value === capturedId) {
        isLoadingOriginal.value = false
      }
    }
  }

  function open(textureId: string, list: Texture[], path?: string) {
    activeTextureId.value = textureId
    visibleList.value = list
    modPath.value = path ?? null
    originalDataUrl.value = null
    loadError.value = null
    activeTab.value = 'original'
    loadOriginal(textureId)
  }

  function close() {
    activeTextureId.value = null
    isLoadingOriginal.value = false
    originalDataUrl.value = null
    loadError.value = null
    visibleList.value = []
    modPath.value = null
  }

  function navigate(direction: 'prev' | 'next') {
    const idx = activeIndex.value
    const next = direction === 'prev' ? idx - 1 : idx + 1
    const clamped = Math.max(0, Math.min(next, visibleList.value.length - 1))
    const target = visibleList.value[clamped]
    if (target) {
      open(target.id, visibleList.value, modPath.value ?? undefined)
    }
  }

  function setTab(tab: 'original' | 'replacement') {
    activeTab.value = tab
    if (tab === 'original' && originalDataUrl.value === null && !isLoadingOriginal.value) {
      if (activeTextureId.value) {
        loadOriginal(activeTextureId.value)
      }
    }
  }

  return {
    activeTexture,
    activeTab,
    originalDataUrl,
    isLoadingOriginal,
    loadError,
    hasPrev,
    hasNext,
    open,
    close,
    navigate,
    setTab,
  }
}
