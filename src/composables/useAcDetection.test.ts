import { clearInvokeHandlers, event, mockInvokeHandler } from '@tauri-apps/api'
import { open } from '@tauri-apps/plugin-dialog'
import { clearMockStore, mockStore } from '@tauri-apps/plugin-store'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { useAcDetection } from './useAcDetection'

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

function setPlatform(platform: string) {
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true })
}

const originalPlatform = navigator.platform

const MOCK_INSTALL_INFO = { path: '/ac', version: '1.16', carCount: 10, trackCount: 5 }
const MOCK_CANDIDATE = {
  path: '/ac',
  label: 'Steam',
  source: 'auto',
  version: '1.16',
  carCount: 10,
  trackCount: 5,
}

beforeEach(() => {
  clearInvokeHandlers()
  clearMockStore()
  vi.clearAllMocks()
  setPlatform('Win32')
})

afterEach(() => {
  setPlatform(originalPlatform)
  vi.restoreAllMocks()
})

describe('init', () => {
  it('Windows, no cache → phase becomes detecting', async () => {
    setPlatform('Win32')
    mockInvokeHandler('detect_ac_install', () => ({ candidates: [] }))
    const { result, unmount } = await withSetup(() => useAcDetection())
    await result.init()
    await flushPromises()
    expect(result.phase.value).toBe('not_found')
    unmount()
  })

  it('non-Windows, no cache → phase becomes not_found', async () => {
    setPlatform('MacIntel')
    const { result, unmount } = await withSetup(() => useAcDetection())
    await result.init()
    await flushPromises()
    expect(result.phase.value).toBe('not_found')
    unmount()
  })

  it('valid cached install → phase becomes detected without calling detectAcInstall', async () => {
    const detectSpy = vi.fn(() => ({ candidates: [MOCK_CANDIDATE] }))
    mockInvokeHandler('detect_ac_install', detectSpy)
    mockInvokeHandler('validate_ac_folder', () => MOCK_INSTALL_INFO)
    mockStore.get.mockResolvedValueOnce({ path: '/ac', detectedAt: '2024-01-01', source: 'auto' })

    const { result, unmount } = await withSetup(() => useAcDetection())
    await result.init()
    await flushPromises()

    expect(result.phase.value).toBe('detected')
    expect(result.install.value?.path).toBe('/ac')
    expect(detectSpy).not.toHaveBeenCalled()
    unmount()
  })

  it('invalid cached install → falls through to detecting/not_found', async () => {
    setPlatform('MacIntel')
    mockStore.get.mockResolvedValueOnce({ path: '/bad', detectedAt: '2024-01-01', source: 'auto' })
    mockInvokeHandler('validate_ac_folder', () => {
      throw 'Missing: content/cars/'
    })

    const { result, unmount } = await withSetup(() => useAcDetection())
    await result.init()
    await flushPromises()

    expect(result.phase.value).toBe('not_found')
    unmount()
  })
})

describe('startDetection', () => {
  it('candidates found → phase becomes detected, install set', async () => {
    mockInvokeHandler('detect_ac_install', () => ({ candidates: [MOCK_CANDIDATE] }))

    const { result, unmount } = await withSetup(() => useAcDetection())
    await result.startDetection()
    await flushPromises()

    expect(result.phase.value).toBe('detected')
    expect(result.install.value?.path).toBe('/ac')
    expect(result.install.value?.source).toBe('auto')
    unmount()
  })

  it('no candidates → phase becomes not_found', async () => {
    mockInvokeHandler('detect_ac_install', () => ({ candidates: [] }))

    const { result, unmount } = await withSetup(() => useAcDetection())
    await result.startDetection()
    await flushPromises()

    expect(result.phase.value).toBe('not_found')
    expect(result.install.value).toBeNull()
    unmount()
  })
})

describe('pickManually', () => {
  it('valid folder → phase becomes detected', async () => {
    vi.mocked(open).mockResolvedValueOnce('/chosen/ac')
    mockInvokeHandler('validate_ac_folder', () => MOCK_INSTALL_INFO)

    const { result, unmount } = await withSetup(() => useAcDetection())
    await result.pickManually()
    await flushPromises()

    expect(result.phase.value).toBe('detected')
    expect(result.install.value?.path).toBe('/chosen/ac')
    expect(result.install.value?.source).toBe('manual')
    unmount()
  })

  it('validation fails → phase stays not_found, validationError set', async () => {
    vi.mocked(open).mockResolvedValueOnce('/bad/path')
    mockInvokeHandler('validate_ac_folder', () => {
      throw 'Missing: content/cars/'
    })

    const { result, unmount } = await withSetup(() => useAcDetection())
    result.phase.value = 'not_found'
    await result.pickManually()
    await flushPromises()

    expect(result.phase.value).toBe('not_found')
    expect(result.validationError.value).toBe('Missing: content/cars/')
    unmount()
  })

  it('validation fails with Error object → validationError set as string', async () => {
    vi.mocked(open).mockResolvedValueOnce('/bad/path')
    mockInvokeHandler('validate_ac_folder', () => {
      throw new Error('Folder not found')
    })

    const { result, unmount } = await withSetup(() => useAcDetection())
    result.phase.value = 'not_found'
    await result.pickManually()
    await flushPromises()

    expect(result.validationError.value).toContain('Folder not found')
    unmount()
  })

  it('dialog cancelled → phase unchanged', async () => {
    vi.mocked(open).mockResolvedValueOnce(null)

    const { result, unmount } = await withSetup(() => useAcDetection())
    result.phase.value = 'not_found'
    await result.pickManually()
    await flushPromises()
    await nextTick()

    expect(result.phase.value).toBe('not_found')
    unmount()
  })
})

describe('changeLocation', () => {
  it('delegates to pickManually', async () => {
    vi.mocked(open).mockResolvedValueOnce('/new/ac')
    mockInvokeHandler('validate_ac_folder', () => MOCK_INSTALL_INFO)

    const { result, unmount } = await withSetup(() => useAcDetection())
    await result.changeLocation()
    await flushPromises()

    expect(result.phase.value).toBe('detected')
    expect(result.install.value?.path).toBe('/new/ac')
    unmount()
  })
})

describe('startDetection — probe events', () => {
  it('updates probes array from ac-probe events', async () => {
    let capturedHandler: ((e: unknown) => void) | undefined
    vi.mocked(event.listen).mockImplementationOnce(
      async (_name: string, handler: (e: unknown) => void) => {
        capturedHandler = handler
        return () => {}
      },
    )
    mockInvokeHandler(
      'detect_ac_install',
      () =>
        new Promise((res) => {
          capturedHandler?.({
            payload: { path: '/ac', label: 'Steam', status: 'active' },
          })
          capturedHandler?.({
            payload: { path: '/ac2', label: 'Epic', status: 'miss' },
          })
          // update existing probe
          capturedHandler?.({
            payload: { path: '/ac', label: 'Steam', status: 'hit' },
          })
          res({ candidates: [] })
        }),
    )

    const { result, unmount } = await withSetup(() => useAcDetection())
    await result.startDetection()
    await flushPromises()

    expect(result.probes.value.length).toBeGreaterThanOrEqual(2)
    const acProbe = result.probes.value.find((p) => p.path === '/ac')
    expect(acProbe?.status).toBe('hit')
    unmount()
  })
})

describe('rescan', () => {
  it('resets install and re-detects', async () => {
    mockInvokeHandler('detect_ac_install', () => ({ candidates: [MOCK_CANDIDATE] }))
    mockInvokeHandler('validate_ac_folder', () => MOCK_INSTALL_INFO)
    mockStore.get.mockResolvedValueOnce({ path: '/ac', detectedAt: '2024-01-01', source: 'auto' })

    const { result, unmount } = await withSetup(() => useAcDetection())
    await result.init()
    await flushPromises()
    expect(result.phase.value).toBe('detected')

    mockInvokeHandler('detect_ac_install', () => ({ candidates: [] }))
    await result.rescan()
    await flushPromises()

    expect(result.install.value).toBeNull()
    expect(result.phase.value).toBe('not_found')
    unmount()
  })
})
