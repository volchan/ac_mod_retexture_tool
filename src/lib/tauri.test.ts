import { afterEach, describe, expect, it } from 'vitest'
import { clearInvokeHandlers, mockInvokeHandler } from '../__mocks__/tauri-api'
import type { Mod, TrackLayoutHero } from '../types/index'
import { listTrackHeroImages, scanModFolder } from './tauri'

afterEach(() => {
  clearInvokeHandlers()
})

describe('scanModFolder', () => {
  it('calls scan_mod_folder command with the given path', async () => {
    const mockMod: Mod = {
      modType: 'car',
      path: '/mods/ferrari_488',
      meta: {
        name: 'Ferrari 488',
        folderName: 'ferrari_488',
        author: 'Test',
        version: '1.0',
        description: '',
      },
      files: [],
      kn5Files: [],
      skinFolders: [],
    }
    mockInvokeHandler('scan_mod_folder', () => mockMod)

    const result = await scanModFolder('/mods/ferrari_488')
    expect(result).toEqual(mockMod)
  })
})

describe('listTrackHeroImages', () => {
  it('calls list_track_hero_images command with the given path', async () => {
    const mockHeroes: TrackLayoutHero[] = [
      { label: 'Loading screen', filename: 'preview.png', url: 'data:image/png;base64,abc' },
    ]
    mockInvokeHandler('list_track_hero_images', () => mockHeroes)

    const result = await listTrackHeroImages('/mods/monza')
    expect(result).toEqual(mockHeroes)
  })
})
