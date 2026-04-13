import { onUnmounted, ref } from 'vue'

const AUTO_RESET_MS = 3000

export function useCancelConfirm(onConfirm: () => void) {
  const confirming = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function request() {
    if (confirming.value) {
      clearTimer()
      confirming.value = false
      onConfirm()
    } else {
      confirming.value = true
      timer = setTimeout(() => {
        confirming.value = false
        clearTimer()
      }, AUTO_RESET_MS)
    }
  }

  function reset() {
    confirming.value = false
    clearTimer()
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  onUnmounted(clearTimer)

  return { confirming, request, reset }
}
