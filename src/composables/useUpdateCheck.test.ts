import { getVersion } from '@tauri-apps/api/app'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { isBetaVersion, isNewer, useUpdateCheck } from './useUpdateCheck'

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

const WIN_ASSET = { name: 'app_1.0.0_x64-setup.exe' }
const MAC_ASSET = { name: 'app_1.0.0.dmg' }

function mockStableFetch(tagName: string, ok = true, assets = [WIN_ASSET]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, json: async () => ({ tag_name: tagName, assets }) })),
  )
}

function mockAllReleasesFetch(
  releases: { tag_name: string; prerelease?: boolean; assets?: { name: string }[] }[],
  ok = true,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      json: async () => releases.map((r) => ({ prerelease: false, assets: [], ...r })),
    })),
  )
}

function setPlatform(platform: string) {
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true })
}

const originalPlatform = navigator.platform

beforeEach(() => {
  vi.mocked(getVersion).mockResolvedValue('1.0.0')
  setPlatform('Win32')
})

afterEach(() => {
  setPlatform(originalPlatform)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ─── isNewer unit tests ───────────────────────────────────────────────────────

describe('isNewer', () => {
  it('detects newer minor', () => expect(isNewer('1.1.0', '1.0.0')).toBe(true))
  it('detects newer patch', () => expect(isNewer('1.0.1', '1.0.0')).toBe(true))
  it('detects newer major', () => expect(isNewer('2.0.0', '1.9.9')).toBe(true))
  it('returns false for same version', () => expect(isNewer('1.0.0', '1.0.0')).toBe(false))
  it('returns false when older', () => expect(isNewer('0.9.0', '1.0.0')).toBe(false))
  it('stable is newer than same-version beta', () =>
    expect(isNewer('1.0.0', '1.0.0-beta.1')).toBe(true))
  it('beta is not newer than same stable', () =>
    expect(isNewer('1.0.0-beta.1', '1.0.0')).toBe(false))
  it('newer beta number is newer', () => expect(isNewer('1.0.0-beta.2', '1.0.0-beta.1')).toBe(true))
  it('beta.10 is newer than beta.9', () =>
    expect(isNewer('1.0.0-beta.10', '1.0.0-beta.9')).toBe(true))
  it('newer minor beta is newer than older stable', () =>
    expect(isNewer('1.1.0-beta.1', '1.0.0')).toBe(true))
  it('missing patch treated as 0', () => expect(isNewer('1.1.1', '1.1')).toBe(true))
})

// ─── isBetaVersion unit tests ─────────────────────────────────────────────────

describe('isBetaVersion', () => {
  it('detects -beta.1', () => expect(isBetaVersion('1.0.0-beta.1')).toBe(true))
  it('detects -rc.1', () => expect(isBetaVersion('1.0.0-rc.1')).toBe(true))
  it('detects -alpha.1', () => expect(isBetaVersion('1.0.0-alpha.1')).toBe(true))
  it('returns false for stable', () => expect(isBetaVersion('1.0.0')).toBe(false))
})

// ─── stable channel (current = 1.0.0) ────────────────────────────────────────

describe('useUpdateCheck — stable channel', () => {
  it('fetches /releases/latest and shows update when newer', async () => {
    mockStableFetch('v1.1.0')
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    expect(result.latestVersion.value).toBe('1.1.0')
    expect(result.currentVersion.value).toBe('1.0.0')
    unmount()
  })

  it('stays false when version matches', async () => {
    mockStableFetch('v1.0.0')
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('stays false when current is newer', async () => {
    mockStableFetch('v0.9.0')
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('stays false when no platform asset', async () => {
    mockStableFetch('v1.1.0', true, [{ name: 'source.tar.gz' }])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('stays false on non-ok response', async () => {
    mockStableFetch('v2.0.0', false)
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

  it('sets updateAvailable on macOS with .dmg asset', async () => {
    setPlatform('MacIntel')
    mockStableFetch('v1.1.0', true, [MAC_ASSET])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    unmount()
  })

  it('stays false on macOS when only .exe asset', async () => {
    setPlatform('MacIntel')
    mockStableFetch('v1.1.0', true, [WIN_ASSET])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('sets updateAvailable on Linux with .AppImage', async () => {
    setPlatform('Linux x86_64')
    mockStableFetch('v1.1.0', true, [{ name: 'app_1.1.0.AppImage' }])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    unmount()
  })

  it('uses userAgentData platform when available', async () => {
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'Windows' },
      configurable: true,
    })
    mockStableFetch('v1.1.0')
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true })
    unmount()
  })

  it('stays false when assets field is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ tag_name: 'v2.0.0' }),
      })),
    )
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })
})

// ─── beta channel (current = 1.0.0-beta.1) ───────────────────────────────────

describe('useUpdateCheck — beta channel', () => {
  beforeEach(() => {
    vi.mocked(getVersion).mockResolvedValue('1.0.0-beta.1')
  })

  it('shows update when a newer beta exists', async () => {
    mockAllReleasesFetch([
      { tag_name: 'v1.0.0-beta.2', prerelease: true, assets: [WIN_ASSET] },
      { tag_name: 'v1.0.0-beta.1', prerelease: true, assets: [WIN_ASSET] },
    ])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    expect(result.latestVersion.value).toBe('1.0.0-beta.2')
    unmount()
  })

  it('shows update when stable supersedes current beta', async () => {
    mockAllReleasesFetch([
      { tag_name: 'v1.0.0', prerelease: false, assets: [WIN_ASSET] },
      { tag_name: 'v1.0.0-beta.1', prerelease: true, assets: [WIN_ASSET] },
    ])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(true)
    expect(result.latestVersion.value).toBe('1.0.0')
    unmount()
  })

  it('picks highest semver across mixed stable and beta releases', async () => {
    mockAllReleasesFetch([
      { tag_name: 'v1.0.0', prerelease: false, assets: [WIN_ASSET] },
      { tag_name: 'v1.1.0-beta.1', prerelease: true, assets: [WIN_ASSET] },
      { tag_name: 'v1.0.0-beta.1', prerelease: true, assets: [WIN_ASSET] },
    ])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.latestVersion.value).toBe('1.1.0-beta.1')
    unmount()
  })

  it('stays false when current beta is already the latest', async () => {
    mockAllReleasesFetch([{ tag_name: 'v1.0.0-beta.1', prerelease: true, assets: [WIN_ASSET] }])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('skips releases with no platform asset', async () => {
    mockAllReleasesFetch([
      { tag_name: 'v1.0.0-beta.2', prerelease: true, assets: [{ name: 'source.tar.gz' }] },
      { tag_name: 'v1.0.0-beta.1', prerelease: true, assets: [WIN_ASSET] },
    ])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('stays false on non-ok response', async () => {
    mockAllReleasesFetch([], false)
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })

  it('stays false when releases list is empty', async () => {
    mockAllReleasesFetch([])
    const { result, unmount } = await withSetup(() => useUpdateCheck())
    expect(result.updateAvailable.value).toBe(false)
    unmount()
  })
})
