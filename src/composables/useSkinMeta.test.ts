import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import type { SkinEntry } from '@/types/index'
import { useSkinMeta } from './useSkinMeta'

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

function skin(overrides: Partial<SkinEntry> = {}): SkinEntry {
  return {
    name: 'red_01',
    path: '/cars/ferrari/skins/red_01',
    displayName: 'Rosso Corsa',
    driverName: 'A Driver',
    team: 'A Team',
    number: '27',
    country: 'Italy',
    textureCount: 4,
    ...overrides,
  }
}

describe('useSkinMeta', () => {
  beforeEach(async () => {
    const { result, unmount } = await withSetup(() => useSkinMeta())
    result.reset()
    unmount()
  })

  it('seeds the form from the opened skin', async () => {
    const { result, unmount } = await withSetup(() => useSkinMeta())
    result.load(skin())

    expect(result.meta.value).toEqual({
      folderName: 'red_01',
      skinName: 'Rosso Corsa',
      driverName: 'A Driver',
      team: 'A Team',
      number: '27',
      country: 'Italy',
    })
    unmount()
  })

  it('falls back to empty strings for fields the skin omits', async () => {
    const { result, unmount } = await withSetup(() => useSkinMeta())
    result.load(skin({ displayName: undefined, team: undefined, country: undefined }))

    expect(result.meta.value?.skinName).toBe('')
    expect(result.meta.value?.team).toBe('')
    expect(result.meta.value?.country).toBe('')
    unmount()
  })

  it('keeping the folder name updates the opened skin', async () => {
    const { result, unmount } = await withSetup(() => useSkinMeta())
    result.load(skin())

    expect(result.isFork.value).toBe(false)
    unmount()
  })

  it('renaming the folder forks a new skin', async () => {
    const { result, unmount } = await withSetup(() => useSkinMeta())
    result.load(skin())
    if (result.meta.value) result.meta.value.folderName = 'blue_02'
    await nextTick()

    expect(result.isFork.value).toBe(true)
    expect(result.openedFolderName.value).toBe('red_01')
    unmount()
  })

  it('rejects a blank or path-unsafe folder name', async () => {
    const { result, unmount } = await withSetup(() => useSkinMeta())
    result.load(skin())

    if (result.meta.value) result.meta.value.folderName = '  '
    await nextTick()
    expect(result.folderNameError.value).toBe('Skin name is required.')

    if (result.meta.value) result.meta.value.folderName = 'red/../evil'
    await nextTick()
    expect(result.folderNameError.value).toContain('letters, digits')

    if (result.meta.value) result.meta.value.folderName = 'red_01.v2-b'
    await nextTick()
    expect(result.folderNameError.value).toBeNull()
    unmount()
  })

  it('a partial export of a renamed skin is flagged as incomplete', async () => {
    const { result, unmount } = await withSetup(() => useSkinMeta())
    result.load(skin())

    result.exportFull.value = false
    await nextTick()
    expect(result.incompleteFork.value).toBe(false)

    if (result.meta.value) result.meta.value.folderName = 'blue_02'
    await nextTick()
    expect(result.incompleteFork.value).toBe(true)

    result.exportFull.value = true
    await nextTick()
    expect(result.incompleteFork.value).toBe(false)
    unmount()
  })

  it('reset clears the form', async () => {
    const { result, unmount } = await withSetup(() => useSkinMeta())
    result.load(skin())
    result.reset()
    await nextTick()

    expect(result.meta.value).toBeNull()
    expect(result.openedFolderName.value).toBe('')
    unmount()
  })
})
