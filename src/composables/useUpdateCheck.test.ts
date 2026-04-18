import { getVersion } from '@tauri-apps/api/app'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useUpdateCheck } from './useUpdateCheck'

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
  await flushPromises()
  return { result, unmount: () => wrapper.unmount() }
}

const MOCK_ASSETS = [{ name: 'app_1.0.0_x64-setup.exe' }]

function mockFetch(tagName: string, ok = true, assets = MOCK_ASSETS) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      json: async () => ({ tag_name: tagName, assets }),
    })),
  )
}

beforeEach(() => {
  vi.mocked(getVersion).mockResolvedValue('1.0.0')
  vi.stubGlobal('navigator', { ...navigator, platform: 'Win32' })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useUpdateCheck', () => {
  it('sets updateAvailable when latest is newer', async () => {
    mockFetch('v1.1.0')
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    expect(result.latestVersion.value).toBe('1.1.0')
    expect(result.currentVersion.value).toBe('1.0.0')
    unmount()
  })

  it('does not set updateAvailable when version matches', async () => {
    mockFetch('v1.0.0')
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('does not set updateAvailable when current is newer', async () => {
    mockFetch('v0.9.0')
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('detects newer patch version', async () => {
    mockFetch('v1.0.1')
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    expect(result.latestVersion.value).toBe('1.0.1')
    unmount()
  })

  it('detects newer major version', async () => {
    mockFetch('v2.0.0')
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    unmount()
  })

  it('treats missing patch in current version as 0 and detects newer', async () => {
    vi.mocked(getVersion).mockResolvedValue('1.1')
    mockFetch('v1.1.1')
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    unmount()
  })

  it('treats missing patch in latest version as 0 and stays false', async () => {
    vi.mocked(getVersion).mockResolvedValue('1.1.1')
    mockFetch('v1.1')
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('exposes currentVersion from getAppVersion', async () => {
    mockFetch('v1.0.0')
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.currentVersion.value).toBe('1.0.0')
    unmount()
  })

  it('stays false when fetch returns non-ok response', async () => {
    mockFetch('v2.0.0', false)
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('stays false on fetch error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network error')
      }),
    )
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('stays false when newer version has no platform binary', async () => {
    mockFetch('v1.1.0', true, [{ name: 'source.tar.gz' }])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('stays false when newer version has empty assets', async () => {
    mockFetch('v1.1.0', true, [])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('sets updateAvailable when newer version has matching binary', async () => {
    mockFetch('v1.1.0', true, [{ name: 'app_1.1.0_x64-setup.exe' }])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    unmount()
  })

  it('matches .EXE uppercase asset name', async () => {
    mockFetch('v1.1.0', true, [{ name: 'app_1.1.0_x64-setup.EXE' }])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    unmount()
  })

  it('sets updateAvailable on macOS with .dmg asset', async () => {
    vi.stubGlobal('navigator', { ...navigator, platform: 'MacIntel' })
    mockFetch('v1.1.0', true, [{ name: 'app_1.1.0.dmg' }])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    unmount()
  })

  it('stays false on macOS when only .exe asset present', async () => {
    vi.stubGlobal('navigator', { ...navigator, platform: 'MacIntel' })
    mockFetch('v1.1.0', true, [{ name: 'app_1.1.0_x64-setup.exe' }])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('sets updateAvailable on Linux with .AppImage asset', async () => {
    vi.stubGlobal('navigator', { ...navigator, platform: 'Linux x86_64' })
    mockFetch('v1.1.0', true, [{ name: 'app_1.1.0.AppImage' }])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    unmount()
  })

  it('sets updateAvailable on Linux with lowercase .appimage asset', async () => {
    vi.stubGlobal('navigator', { ...navigator, platform: 'Linux x86_64' })
    mockFetch('v1.1.0', true, [{ name: 'app_1.1.0.appimage' }])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    unmount()
  })
})
