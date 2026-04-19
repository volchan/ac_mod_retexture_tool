import { ref } from 'vue'
import { onRepackProgress, repackMod } from '@/lib/tauri'
import type { ProgressInfo, RepackOptions } from '@/types/index'

const isRepacking = ref(false)
const repackProgress = ref<ProgressInfo>({ current: 0, total: 0, label: '' })
const repackDone = ref(false)
const repackError = ref<string | null>(null)

export function useRepack() {
  async function startRepack(opts: RepackOptions): Promise<void> {
    isRepacking.value = true
    repackDone.value = false
    repackError.value = null
    repackProgress.value = { current: 0, total: 0, label: '' }

    let unlisten: (() => void) | undefined
    try {
      unlisten = await onRepackProgress((info) => {
        repackProgress.value = info
      })
      await repackMod(opts)
      repackDone.value = true
    } catch (e) {
      repackError.value = e instanceof Error ? e.message : String(e)
    } finally {
      isRepacking.value = false
      unlisten?.()
    }
  }

  function reset() {
    isRepacking.value = false
    repackProgress.value = { current: 0, total: 0, label: '' }
    repackDone.value = false
    repackError.value = null
  }

  return {
    isRepacking,
    repackProgress,
    repackDone,
    repackError,
    startRepack,
    reset,
  }
}
