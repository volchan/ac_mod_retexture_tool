import { load } from '@tauri-apps/plugin-store'
import { onMounted, onUnmounted, ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORE_KEY = 'theme-mode'
const DARK_CLASS = 'dark'
const LS_KEY = 'theme-mode'

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

function applyTheme(resolved: 'light' | 'dark') {
  if (resolved === 'dark') {
    document.documentElement.classList.add(DARK_CLASS)
  } else {
    document.documentElement.classList.remove(DARK_CLASS)
  }
}

const MODE_CYCLE: ThemeMode[] = ['light', 'dark', 'system']

export function useTheme() {
  const mode = ref<ThemeMode>('system')
  const theme = ref<'light' | 'dark'>(resolveTheme('system'))

  let mediaQuery: MediaQueryList | null = null
  let mediaListener: ((e: MediaQueryListEvent) => void) | null = null

  function updateTheme(newMode: ThemeMode) {
    if (mediaQuery && mediaListener) {
      mediaQuery.removeEventListener('change', mediaListener)
      mediaListener = null
    }

    const resolved = resolveTheme(newMode)
    theme.value = resolved
    applyTheme(resolved)

    if (newMode === 'system') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaListener = (e: MediaQueryListEvent) => {
        theme.value = e.matches ? 'dark' : 'light'
        applyTheme(theme.value)
      }
      mediaQuery.addEventListener('change', mediaListener)
    }
  }

  async function setMode(newMode: ThemeMode) {
    mode.value = newMode
    updateTheme(newMode)
    localStorage.setItem(LS_KEY, newMode)
    const store = await load('settings.json')
    await store.set(STORE_KEY, newMode)
    await store.save()
  }

  function cycleMode(): Promise<void> {
    const currentIndex = MODE_CYCLE.indexOf(mode.value)
    const nextIndex = (currentIndex + 1) % MODE_CYCLE.length
    return setMode(MODE_CYCLE[nextIndex])
  }

  onMounted(async () => {
    const store = await load('settings.json')
    const persisted = await store.get<ThemeMode>(STORE_KEY)
    const initialMode: ThemeMode = persisted ?? 'system'
    mode.value = initialMode
    updateTheme(initialMode)
    localStorage.setItem(LS_KEY, initialMode)
  })

  watch(mode, (newMode) => {
    updateTheme(newMode)
  })

  onUnmounted(() => {
    if (mediaQuery && mediaListener) {
      mediaQuery.removeEventListener('change', mediaListener)
    }
  })

  return { theme, mode, setMode, cycleMode }
}
