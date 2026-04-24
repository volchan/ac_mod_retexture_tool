import { ref } from 'vue'
import { listAcContent, onAcLibraryEntry } from '@/lib/tauri'
import type { LibraryEntry, ModType } from '@/types/index'

let activeScanId = 0

export function useAcLibrary() {
  const entries = ref<LibraryEntry[]>([])
  const isScanning = ref(false)
  const scannedCount = ref(0)

  async function scanLibrary(installPath: string): Promise<void> {
    const scanId = ++activeScanId
    isScanning.value = true
    entries.value = []
    scannedCount.value = 0

    const unlisten = await onAcLibraryEntry(() => {
      if (scanId === activeScanId) scannedCount.value += 1
    })

    try {
      const all = await listAcContent(installPath)
      if (scanId === activeScanId) entries.value = all
    } finally {
      unlisten()
      if (scanId === activeScanId) isScanning.value = false
    }
  }

  function getFiltered(
    q: string,
    type: 'all' | ModType,
    source: 'all' | 'kunos' | 'mods',
    sortBy: 'name' | 'textures',
  ): LibraryEntry[] {
    const lower = q.toLowerCase()

    const filtered = entries.value.filter((m) => {
      if (type !== 'all' && m.modType !== type) return false
      if (source === 'kunos' && !m.isKunos) return false
      if (source === 'mods' && m.isKunos) return false
      if (lower && !m.name.toLowerCase().includes(lower) && !m.id.toLowerCase().includes(lower))
        return false
      return true
    })

    if (sortBy === 'name') {
      return filtered.sort((a, b) => a.name.localeCompare(b.name))
    }
    return filtered.sort((a, b) => b.textureCount - a.textureCount)
  }

  return { entries, isScanning, scannedCount, scanLibrary, getFiltered }
}
