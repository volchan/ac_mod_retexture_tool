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

  it('refuses a folder name that only points at another directory', async () => {
    const { result, unmount } = await withSetup(() => useSkinMeta())
    result.load(skin())

    for (const name of ['.', '..']) {
      if (result.meta.value) result.meta.value.folderName = name
      await nextTick()
      expect(result.folderNameError.value).not.toBeNull()
    }
    unmount()
  })
})

describe('syncFolderToNumber', () => {
  async function metaAfter(folderName: string, raceNumber: string) {
    const { result, unmount } = await withSetup(() => useSkinMeta())
    result.load(skin({ name: folderName }))
    result.syncFolderToNumber(raceNumber)
    const folder = result.meta.value?.folderName
    unmount()
    return folder
  }

  it('puts the number after the name the author chose', async () => {
    expect(await metaAfter('racing_blue', '24')).toBe('racing_blue_24')
  })

  /// Typing a second digit would otherwise stack suffixes: racing_blue_51_2.
  it('replaces a number already there rather than stacking another', async () => {
    expect(await metaAfter('racing_blue_51', '24')).toBe('racing_blue_24')
  })

  it('replaces a number carrying a letter, as an entry list allows', async () => {
    expect(await metaAfter('racing_blue_51A', '24')).toBe('racing_blue_24')
  })

  /// How a grid is laid out on disk: the team or the skin's index comes first
  /// and only the last segment is the driver's number.
  it('leaves a leading team or index alone and swaps the number that closes the name', async () => {
    expect(await metaAfter('0_Nissan_12', '24')).toBe('0_Nissan_24')
    expect(await metaAfter('JRM_230', '24')).toBe('JRM_24')
    expect(await metaAfter('01_red', '24')).toBe('01_red_24')
  })

  /// The suffix has to start with a digit, or the last word of every skin name
  /// would be eaten as if it were a number.
  it('leaves a name whose last word is a word alone', async () => {
    expect(await metaAfter('rosso_corsa', '24')).toBe('rosso_corsa_24')
    expect(await metaAfter('red_v2', '24')).toBe('red_v2_24')
  })

  it('strips the suffix back off when the number is cleared', async () => {
    expect(await metaAfter('racing_blue_24', '')).toBe('racing_blue')
    expect(await metaAfter('racing_blue_24', '   ')).toBe('racing_blue')
  })

  it('keeps a number AC would read but a folder name would not hold', async () => {
    expect(await metaAfter('racing_blue', '# 24')).toBe('racing_blue_24')
  })

  it('names the folder after the number alone when nothing else is left', async () => {
    expect(await metaAfter('51', '24')).toBe('24')
  })

  /// A skin is only opened, never renamed, by being looked at: the sync runs on
  /// the author's own edit, so loading must leave the folder exactly as found.
  it('is not what load does', async () => {
    const { result, unmount } = await withSetup(() => useSkinMeta())
    result.load(skin({ name: 'racing_blue', number: '24' }))

    expect(result.meta.value?.folderName).toBe('racing_blue')
    expect(result.isFork.value).toBe(false)
    unmount()
  })

  it('does nothing when no skin is open', async () => {
    const { result, unmount } = await withSetup(() => useSkinMeta())
    result.reset()

    expect(() => result.syncFolderToNumber('24')).not.toThrow()
    expect(result.meta.value).toBeNull()
    unmount()
  })
})
