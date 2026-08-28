import { clearInvokeHandlers, event, mockInvokeHandler } from '@tauri-apps/api'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import type { LibraryEntry } from '@/types/index'
import { useAcLibrary } from './useAcLibrary'

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

function makeEntry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: 'test_car',
    modType: 'car',
    path: '/ac/content/cars/test_car',
    name: 'Test Car',
    isKunos: false,
    textureCount: 10,
    ...overrides,
  }
}

const CARS: LibraryEntry[] = [
  makeEntry({
    id: 'ferrari_488',
    name: 'Ferrari 488',
    modType: 'car',
    isKunos: true,
    textureCount: 50,
  }),
  makeEntry({
    id: 'porsche_911',
    name: 'Porsche 911',
    modType: 'car',
    isKunos: false,
    textureCount: 30,
  }),
]

const TRACKS: LibraryEntry[] = [
  makeEntry({
    id: 'monza',
    name: 'Monza',
    modType: 'track',
    isKunos: true,
    textureCount: 200,
    country: 'Italy',
  }),
]

const ALL_ENTRIES = [...CARS, ...TRACKS]

beforeEach(() => {
  clearInvokeHandlers()
})

afterEach(() => {
  clearInvokeHandlers()
})

describe('scanLibrary', () => {
  it('calls listAcContent and populates entries', async () => {
    mockInvokeHandler('list_ac_content', () => ALL_ENTRIES)

    const { result, unmount } = await withSetup(() => useAcLibrary())
    await result.scanLibrary('/ac')
    await flushPromises()

    expect(result.entries.value).toHaveLength(3)
    expect(result.entries.value[0].id).toBe('ferrari_488')
    unmount()
  })

  it('sets isScanning true during scan, false after', async () => {
    let resolveInvoke: ((v: LibraryEntry[]) => void) | undefined
    mockInvokeHandler(
      'list_ac_content',
      () =>
        new Promise<LibraryEntry[]>((res) => {
          resolveInvoke = res
        }),
    )

    const { result, unmount } = await withSetup(() => useAcLibrary())
    const scanPromise = result.scanLibrary('/ac')

    // isScanning is set synchronously at the start of scanLibrary
    expect(result.isScanning.value).toBe(true)

    // flush microtasks to let listen + invoke promises resolve their setup phase
    await flushPromises()

    // resolveInvoke is now set (listAcContent promise constructor ran)
    expect(resolveInvoke).toBeDefined()

    resolveInvoke?.(ALL_ENTRIES)
    await scanPromise
    await flushPromises()

    expect(result.isScanning.value).toBe(false)
    unmount()
  })

  it('increments scannedCount when ac-library-entry events fire', async () => {
    let capturedHandler: ((e: unknown) => void) | undefined
    vi.mocked(event.listen).mockImplementationOnce(
      async (_name: string, handler: (e: unknown) => void) => {
        capturedHandler = handler
        return () => {}
      },
    )
    mockInvokeHandler(
      'list_ac_content',
      () =>
        new Promise<LibraryEntry[]>((res) => {
          capturedHandler?.({ payload: CARS[0] })
          res(ALL_ENTRIES)
        }),
    )

    const { result, unmount } = await withSetup(() => useAcLibrary())
    await result.scanLibrary('/ac')
    await flushPromises()

    expect(result.scannedCount.value).toBeGreaterThanOrEqual(1)
    unmount()
  })
})

describe('getFiltered', () => {
  it('filters by type', async () => {
    mockInvokeHandler('list_ac_content', () => ALL_ENTRIES)
    const { result, unmount } = await withSetup(() => useAcLibrary())
    await result.scanLibrary('/ac')
    await flushPromises()

    const cars = result.getFiltered('', 'car', 'all', 'name')
    expect(cars.every((e) => e.modType === 'car')).toBe(true)
    expect(cars).toHaveLength(2)

    const tracks = result.getFiltered('', 'track', 'all', 'name')
    expect(tracks).toHaveLength(1)
    unmount()
  })

  it('filters by source (kunos/mods)', async () => {
    mockInvokeHandler('list_ac_content', () => ALL_ENTRIES)
    const { result, unmount } = await withSetup(() => useAcLibrary())
    await result.scanLibrary('/ac')
    await flushPromises()

    const kunos = result.getFiltered('', 'all', 'kunos', 'name')
    expect(kunos.every((e) => e.isKunos)).toBe(true)
    expect(kunos).toHaveLength(2)

    const mods = result.getFiltered('', 'all', 'mods', 'name')
    expect(mods.every((e) => !e.isKunos)).toBe(true)
    expect(mods).toHaveLength(1)
    unmount()
  })

  it('filters by search query', async () => {
    mockInvokeHandler('list_ac_content', () => ALL_ENTRIES)
    const { result, unmount } = await withSetup(() => useAcLibrary())
    await result.scanLibrary('/ac')
    await flushPromises()

    const results = result.getFiltered('ferrari', 'all', 'all', 'name')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('ferrari_488')
    unmount()
  })

  it('sorts by name', async () => {
    mockInvokeHandler('list_ac_content', () => ALL_ENTRIES)
    const { result, unmount } = await withSetup(() => useAcLibrary())
    await result.scanLibrary('/ac')
    await flushPromises()

    const sorted = result.getFiltered('', 'car', 'all', 'name')
    expect(sorted[0].name).toBe('Ferrari 488')
    expect(sorted[1].name).toBe('Porsche 911')
    unmount()
  })

  it('sorts by textures', async () => {
    mockInvokeHandler('list_ac_content', () => ALL_ENTRIES)
    const { result, unmount } = await withSetup(() => useAcLibrary())
    await result.scanLibrary('/ac')
    await flushPromises()

    const sorted = result.getFiltered('', 'car', 'all', 'textures')
    expect(sorted[0].textureCount).toBeGreaterThanOrEqual(sorted[1].textureCount)
    unmount()
  })
})
