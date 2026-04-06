import { clearMockStore, load, mockStore } from '@tauri-apps/plugin-store'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
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

async function withSetup<T>(composable: () => T): Promise<{ result: T; unmount: () => void }> {
  let result!: T
  const App = defineComponent({
    setup() {
      result = composable()
      return {}
    },
    template: '<div/>',
  })
  const wrapper = mount(App)
  // Flush all pending microtasks (onMounted async callbacks)
  await nextTick()
  await nextTick()
  return { result, unmount: () => wrapper.unmount() }
}

beforeEach(() => {
  clearMockStore()
  vi.restoreAllMocks()
  document.documentElement.classList.remove('dark')
})

describe('useTheme', () => {
  it('defaults to system mode', async () => {
    mockMatchMedia(false)
    const { result, unmount } = await withSetup(() => useTheme())
    expect(result.mode.value).toBe('system')
    unmount()
  })

  it('resolves system mode to light when prefers-color-scheme is light', async () => {
    mockMatchMedia(false)
    const { result, unmount } = await withSetup(() => useTheme())
    expect(result.theme.value).toBe('light')
    unmount()
  })

  it('resolves system mode to dark when prefers-color-scheme is dark', async () => {
    mockMatchMedia(true)
    const { result, unmount } = await withSetup(() => useTheme())
    expect(result.theme.value).toBe('dark')
    unmount()
  })

  it('cycles system → light → dark → system', async () => {
    mockMatchMedia(false)
    const { result, unmount } = await withSetup(() => useTheme())

    await result.cycleMode()
    expect(result.mode.value).toBe('light')

    await result.cycleMode()
    expect(result.mode.value).toBe('dark')

    await result.cycleMode()
    expect(result.mode.value).toBe('system')
    unmount()
  })

  it('adds .dark class when theme is dark', async () => {
    mockMatchMedia(false)
    const { result, unmount } = await withSetup(() => useTheme())
    await result.setMode('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    unmount()
  })

  it('removes .dark class when theme is light', async () => {
    mockMatchMedia(false)
    document.documentElement.classList.add('dark')
    const { result, unmount } = await withSetup(() => useTheme())
    await result.setMode('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    unmount()
  })

  it('persists mode to store on setMode', async () => {
    mockMatchMedia(false)
    const { result, unmount } = await withSetup(() => useTheme())
    await result.setMode('dark')
    expect(mockStore.set).toHaveBeenCalledWith('theme-mode', 'dark')
    expect(mockStore.save).toHaveBeenCalled()
    unmount()
  })

  it('reads persisted mode from store on mount', async () => {
    mockMatchMedia(false)
    const store = await load('settings.json')
    await store.set('theme-mode', 'dark' as ThemeMode)

    const { result, unmount } = await withSetup(() => useTheme())
    expect(load).toHaveBeenCalled()
    expect(result.mode.value).toBe('dark')
    unmount()
  })

  it('listens to system preference changes in system mode', async () => {
    const { mql, listeners } = mockMatchMedia(false)
    const { result, unmount } = await withSetup(() => useTheme())

    await result.setMode('system')
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))

    listeners.forEach((l) => {
      l({ matches: true } as MediaQueryListEvent)
    })
    expect(result.theme.value).toBe('dark')

    listeners.forEach((l) => {
      l({ matches: false } as MediaQueryListEvent)
    })
    expect(result.theme.value).toBe('light')
    unmount()
  })

  it('removes system listener when switching away from system mode', async () => {
    const { mql } = mockMatchMedia(false)
    const { result, unmount } = await withSetup(() => useTheme())

    await result.setMode('system')
    expect(mql.addEventListener).toHaveBeenCalled()

    await result.setMode('light')
    expect(mql.removeEventListener).toHaveBeenCalled()
    unmount()
  })

  it('cleans up media listener on unmount when in system mode', async () => {
    const { mql } = mockMatchMedia(false)
    const { result, unmount } = await withSetup(() => useTheme())

    await result.setMode('system')
    expect(mql.addEventListener).toHaveBeenCalled()

    unmount()
    expect(mql.removeEventListener).toHaveBeenCalled()
  })
})
