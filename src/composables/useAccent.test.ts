import { clearMockStore } from '@tauri-apps/plugin-store'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { useAccent } from './useAccent'

function mockMatchMedia(prefersDark = false) {
  const mql = {
    matches: prefersDark,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList)
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
  await nextTick()
  return { result, unmount: () => wrapper.unmount() }
}

beforeEach(() => {
  clearMockStore()
  mockMatchMedia(false)
  localStorage.clear()
  document.documentElement.style.cssText = ''
  document.documentElement.classList.remove('dark')
  // Reset singleton accent to cobalt
  const { setAccent } = useAccent()
  setAccent('cobalt')
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.style.cssText = ''
  document.documentElement.classList.remove('dark')
})

describe('useAccent', () => {
  it('default accent is cobalt after reset', async () => {
    const { result, unmount } = await withSetup(() => useAccent())
    expect(result.accent.value).toBe('cobalt')
    unmount()
  })

  it('setAccent changes accent.value', async () => {
    const { result, unmount } = await withSetup(() => useAccent())
    result.setAccent('crimson')
    expect(result.accent.value).toBe('crimson')
    unmount()
  })

  it('setAccent persists to localStorage', async () => {
    const { result, unmount } = await withSetup(() => useAccent())
    result.setAccent('papaya')
    expect(localStorage.getItem('ac-accent')).toBe('papaya')
    unmount()
  })

  it('setAccent applies CSS variables to document.documentElement', async () => {
    const { result, unmount } = await withSetup(() => useAccent())
    result.setAccent('cobalt')
    const style = document.documentElement.style
    expect(style.getPropertyValue('--primary')).toBeTruthy()
    expect(style.getPropertyValue('--primary-foreground')).toBeTruthy()
    unmount()
  })

  it('ACCENTS object is exported and contains all 4 keys', async () => {
    const { result, unmount } = await withSetup(() => useAccent())
    expect(result.ACCENTS).toBeDefined()
    expect(Object.keys(result.ACCENTS)).toEqual(
      expect.arrayContaining(['cobalt', 'crimson', 'papaya', 'brg']),
    )
    expect(Object.keys(result.ACCENTS)).toHaveLength(4)
    unmount()
  })

  it('each accent definition has light and dark tokens', async () => {
    const { result, unmount } = await withSetup(() => useAccent())
    for (const key of Object.keys(result.ACCENTS)) {
      const def = result.ACCENTS[key as keyof typeof result.ACCENTS]
      expect(def.light).toBeDefined()
      expect(def.dark).toBeDefined()
      expect(def.light.base).toBeTruthy()
      expect(def.dark.base).toBeTruthy()
    }
    unmount()
  })

  it('setAccent accepts all valid accent keys', async () => {
    const { result, unmount } = await withSetup(() => useAccent())
    for (const key of ['cobalt', 'crimson', 'papaya', 'brg'] as const) {
      result.setAccent(key)
      expect(result.accent.value).toBe(key)
      expect(localStorage.getItem('ac-accent')).toBe(key)
    }
    unmount()
  })

  it('setAccent applies dark tokens when theme is dark', async () => {
    localStorage.setItem('theme-mode', 'dark')
    mockMatchMedia(true)

    const { result, unmount } = await withSetup(() => useAccent())
    result.setAccent('crimson')

    const primary = document.documentElement.style.getPropertyValue('--primary')
    expect(primary).toBe('#ef4444')
    unmount()
  })

  it('setAccent applies light tokens when theme is light', async () => {
    localStorage.setItem('theme-mode', 'light')
    mockMatchMedia(false)

    const { result, unmount } = await withSetup(() => useAccent())
    result.setAccent('crimson')

    const primary = document.documentElement.style.getPropertyValue('--primary')
    expect(primary).toBe('#b91c1c')
    unmount()
  })

  it('watch on theme change re-applies CSS variables', async () => {
    const { result, unmount } = await withSetup(() => useAccent())
    result.setAccent('cobalt')
    await nextTick()
    const primaryLight = document.documentElement.style.getPropertyValue('--primary')
    expect(primaryLight).toBeTruthy()

    result.setTheme('dark')
    await nextTick()
    const primaryDark = document.documentElement.style.getPropertyValue('--primary')
    expect(primaryDark).toBeTruthy()
    expect(primaryDark).not.toBe(primaryLight)
    unmount()
  })

  it('setAccent ring token is set to the base color', async () => {
    const { result, unmount } = await withSetup(() => useAccent())
    result.setAccent('brg')
    const ring = document.documentElement.style.getPropertyValue('--ring')
    expect(ring).toBeTruthy()
    unmount()
  })
})
