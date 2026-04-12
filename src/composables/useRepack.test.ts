import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import type { RepackOptions } from '../types/index'
import { useRepack } from './useRepack'

vi.mock('@/lib/tauri', () => ({
  repackMod: vi.fn(),
  onRepackProgress: vi.fn(async () => () => {}),
}))

import { onRepackProgress, repackMod } from '@/lib/tauri'

const opts: RepackOptions = {
  modPath: '/mods/car',
  outputPath: '/out/car.7z',
  meta: {
    name: 'Test Car',
    folderName: 'test_car',
    author: 'Tester',
    version: '1.0',
    description: '',
  },
  replacements: [],
}

function withSetup<T>(composable: () => T): [T, () => void] {
  let result!: T
  const app = mount(
    defineComponent({
      setup() {
        result = composable()
        return {}
      },
      template: '<div/>',
    }),
  )
  return [result, () => app.unmount()]
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  const [{ reset }, unmount] = withSetup(() => useRepack())
  reset()
  unmount()
})

describe('useRepack', () => {
  it('starts in idle state', () => {
    const [{ isRepacking, repackDone, repackError }, unmount] = withSetup(() => useRepack())
    expect(isRepacking.value).toBe(false)
    expect(repackDone.value).toBe(false)
    expect(repackError.value).toBeNull()
    unmount()
  })

  it('sets isRepacking true while repacking', async () => {
    let resolve!: () => void
    vi.mocked(repackMod).mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolve = r
        }),
    )
    const [{ isRepacking, startRepack }, unmount] = withSetup(() => useRepack())

    const p = startRepack(opts)
    await nextTick()
    expect(isRepacking.value).toBe(true)

    resolve()
    await p
    expect(isRepacking.value).toBe(false)
    unmount()
  })

  it('sets repackDone on success', async () => {
    vi.mocked(repackMod).mockResolvedValueOnce(undefined)
    const [{ repackDone, startRepack }, unmount] = withSetup(() => useRepack())

    await startRepack(opts)
    expect(repackDone.value).toBe(true)
    unmount()
  })

  it('sets repackError on failure', async () => {
    vi.mocked(repackMod).mockRejectedValueOnce(new Error('disk full'))
    const [{ repackError, repackDone, startRepack }, unmount] = withSetup(() => useRepack())

    await startRepack(opts)
    expect(repackError.value).toBe('disk full')
    expect(repackDone.value).toBe(false)
    unmount()
  })

  it('updates repackProgress from onRepackProgress event', async () => {
    type ProgressCb = (info: { current: number; total: number; label: string }) => void
    let progressCb!: ProgressCb
    vi.mocked(onRepackProgress).mockImplementationOnce(async (cb) => {
      progressCb = cb as ProgressCb
      return () => {}
    })
    vi.mocked(repackMod).mockImplementationOnce(async () => {
      progressCb({ current: 2, total: 4, label: 'Updating metadata' })
    })

    const [{ repackProgress, startRepack }, unmount] = withSetup(() => useRepack())
    await startRepack(opts)

    expect(repackProgress.value.current).toBe(2)
    expect(repackProgress.value.label).toBe('Updating metadata')
    unmount()
  })

  it('reset clears all state', async () => {
    vi.mocked(repackMod).mockResolvedValueOnce(undefined)
    const [{ repackDone, repackError, reset, startRepack }, unmount] = withSetup(() => useRepack())

    await startRepack(opts)
    expect(repackDone.value).toBe(true)

    reset()
    await nextTick()
    expect(repackDone.value).toBe(false)
    expect(repackError.value).toBeNull()
    unmount()
  })

  it('clears previous error on new startRepack', async () => {
    vi.mocked(repackMod).mockRejectedValueOnce(new Error('first'))
    const [{ repackError, startRepack }, unmount] = withSetup(() => useRepack())

    await startRepack(opts)
    expect(repackError.value).toBe('first')

    vi.mocked(repackMod).mockResolvedValueOnce(undefined)
    await startRepack(opts)
    expect(repackError.value).toBeNull()
    unmount()
  })
})
