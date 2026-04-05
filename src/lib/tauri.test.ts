import { afterEach, describe, expect, it } from 'vitest'
import { clearInvokeHandlers, mockInvokeHandler } from '../__mocks__/tauri-api'
import type { Mod } from '../types/index'
import { scanModFolder } from './tauri'

afterEach(() => {
  clearInvokeHandlers()
})

describe('scanModFolder', () => {
  it('calls scan_mod_folder command with the given path', async () => {
    const mockMod: Mod = {
      type: 'car',
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
