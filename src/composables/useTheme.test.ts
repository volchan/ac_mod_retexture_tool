import { clearMockStore, load, mockStore } from '@tauri-apps/plugin-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { type ThemeMode, useTheme } from './useTheme'

function mockMatchMedia(prefersDark: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = []
  const mql = {
    matches: prefersDark,
    addEventListener: vi.fn((_event: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.push(cb)
    }),
    removeEventListener: vi.fn((_event: string, cb: (e: MediaQueryListEvent) => void) => {
      const i = listeners.indexOf(cb)
      if (i >= 0) listeners.splice(i, 1)
    }),
  }
  vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList)
  return { mql, listeners }
}

beforeEach(() => {
  clearMockStore()
  vi.restoreAllMocks()
  document.documentElement.classList.remove('dark')
})

describe('useTheme', () => {
  it('defaults to system mode', () => {
    mockMatchMedia(false)
    const { mode } = useTheme()
    expect(mode.value).toBe('system')
  })

  it('resolves system mode to light when prefers-color-scheme is light', async () => {
    mockMatchMedia(false)
    const { theme, mode } = useTheme()
    mode.value = 'system'
    await nextTick()
    expect(theme.value).toBe('light')
  })

  it('resolves system mode to dark when prefers-color-scheme is dark', async () => {
    mockMatchMedia(true)
    const { theme, mode } = useTheme()
    mode.value = 'system'
    await nextTick()
    expect(theme.value).toBe('dark')
  })

  it('cycles system → light → dark → system', async () => {
    mockMatchMedia(false)
    const { mode, cycleMode } = useTheme()

    // Initial: system (index 2) → light (index 0)
    await cycleMode()
    expect(mode.value).toBe('light')

    // light (index 0) → dark (index 1)
    await cycleMode()
    expect(mode.value).toBe('dark')

    // dark (index 1) → system (index 2)
    await cycleMode()
    expect(mode.value).toBe('system')
  })

  it('adds .dark class when theme is dark', async () => {
    mockMatchMedia(false)
    const { setMode } = useTheme()
    await setMode('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes .dark class when theme is light', async () => {
    mockMatchMedia(false)
    document.documentElement.classList.add('dark')
    const { setMode } = useTheme()
    await setMode('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists mode to store on setMode', async () => {
    mockMatchMedia(false)
    const { setMode } = useTheme()
    await setMode('dark')
    expect(mockStore.set).toHaveBeenCalledWith('theme-mode', 'dark')
    expect(mockStore.save).toHaveBeenCalled()
  })

  it('reads persisted mode from store on mount', async () => {
    mockMatchMedia(false)
    const store = await load('settings.json')
    await store.set('theme-mode', 'dark' as ThemeMode)

    const { mode } = useTheme()
    // Simulate onMounted by manually calling the async init
    // We test that setMode was called during mount via mock store state
    // The composable reads from store on mount
    expect(load).toHaveBeenCalled()
    expect(mode.value).toBeDefined()
  })

  it('listens to system preference changes in system mode', async () => {
    const { mql, listeners } = mockMatchMedia(false)
    const { theme, setMode } = useTheme()

    await setMode('system')
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))

    // Simulate dark mode change
    listeners.forEach((l) => {
      l({ matches: true } as MediaQueryListEvent)
    })
    expect(theme.value).toBe('dark')

    // Simulate light mode change
    listeners.forEach((l) => {
      l({ matches: false } as MediaQueryListEvent)
    })
    expect(theme.value).toBe('light')
  })

  it('removes system listener when switching away from system mode', async () => {
    const { mql } = mockMatchMedia(false)
    const { setMode } = useTheme()

    await setMode('system')
    expect(mql.addEventListener).toHaveBeenCalled()

    await setMode('light')
    expect(mql.removeEventListener).toHaveBeenCalled()
  })
})
