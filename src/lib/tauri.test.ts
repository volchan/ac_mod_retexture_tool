import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearInvokeHandlers,
  listen,
  mockInvokeHandler,
  WebviewWindow,
} from '../__mocks__/tauri-api'
import type { Mod, ProgressInfo, Texture } from '../types/index'
import {
  clearKn5Cache,
  getKn5Texture,
  getSkinTexture,
  getTrackHeroImage,
  onRepackProgress,
  openTexturePreviewWindow,
  repackMod,
  scanModFolder,
  showSaveDialog,
} from './tauri'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(async () => null),
}))

import { save } from '@tauri-apps/plugin-dialog'

beforeEach(() => {
  vi.mocked(WebviewWindow).mockClear()
  ;(
    WebviewWindow as unknown as { getByLabel: ReturnType<typeof vi.fn> }
  ).getByLabel.mockResolvedValue(null)
})

afterEach(() => {
  clearInvokeHandlers()
  vi.restoreAllMocks()
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

describe('showSaveDialog', () => {
  it('calls save with defaultPath and zip filter', async () => {
    vi.mocked(save).mockResolvedValueOnce('/output/car.zip')

    const result = await showSaveDialog('car.zip')
    expect(save).toHaveBeenCalledWith({
      defaultPath: 'car.zip',
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    })
    expect(result).toBe('/output/car.zip')
  })
})

describe('repackMod', () => {
  it('invokes repack_mod with opts', async () => {
    mockInvokeHandler('repack_mod', () => undefined)

    await repackMod({
      modPath: '/mods/car',
      outputPath: '/out/car.zip',
      meta: { name: 'Car', folderName: 'car', author: '', version: '', description: '' },
      replacements: [],
    })
  })
})

describe('onRepackProgress', () => {
  it('registers repack-progress listener and returns unlisten', async () => {
    const handler = vi.fn()
    vi.mocked(listen).mockImplementation(async (eventName, cb) => {
      if (eventName === 'repack-progress') {
        const typedCb = cb as (e: { payload: ProgressInfo }) => void
        typedCb({ payload: { current: 1, total: 2, label: 'packing' } })
      }
      return () => {}
    })

    const unlisten = await onRepackProgress(handler)
    expect(handler).toHaveBeenCalledWith({ current: 1, total: 2, label: 'packing' })
    expect(typeof unlisten).toBe('function')
  })
})

describe('getKn5Texture', () => {
  it('invokes get_kn5_texture and returns data url', async () => {
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,abc')

    const result = await getKn5Texture('/mods/car.kn5', 'body.dds')
    expect(result).toBe('data:image/png;base64,abc')
  })
})

function makeTexture(overrides: Partial<Texture> = {}): Texture {
  return {
    id: 'tex1',
    name: 'body.dds',
    path: '/mods/car.kn5',
    source: 'kn5',
    kn5File: '/mods/car.kn5',
    category: 'body',
    width: 1024,
    height: 1024,
    format: 'BC3',
    previewUrl: 'data:image/png;base64,abc',
    isDecoded: true,
    ...overrides,
  }
}

describe('openTexturePreviewWindow', () => {
  it('creates WebviewWindow with preview URL containing encoded texture data', async () => {
    const tex = makeTexture()
    await openTexturePreviewWindow(tex, '/mods/car')

    expect(WebviewWindow).toHaveBeenCalledOnce()
    const [label, opts] = vi.mocked(WebviewWindow).mock.calls[0] as [
      string,
      { url: string; title: string },
    ]
    expect(label).toBe('preview_tex1')
    expect(opts.url).toContain('preview=1')
    expect(opts.url).toContain('data=')
    expect(opts.title).toBe('body.dds')
  })

  it('strips previewUrl and isDecoded from encoded payload', async () => {
    const tex = makeTexture({ previewUrl: 'data:image/png;base64,LARGE' })
    await openTexturePreviewWindow(tex, '/mods/car')

    const [, opts] = vi.mocked(WebviewWindow).mock.calls[0] as [string, { url: string }]
    const encoded =
      new URL(`http://x${opts.url.slice(opts.url.indexOf('?'))}`).searchParams.get('data') ?? ''
    const decoded = JSON.parse(encoded)
    expect(decoded).not.toHaveProperty('previewUrl')
    expect(decoded).not.toHaveProperty('isDecoded')
    expect(decoded.id).toBe('tex1')
    expect(decoded.name).toBe('body.dds')
  })

  it('strips replacement previewUrl when encoding', async () => {
    const tex = makeTexture({
      replacement: {
        sourcePath: '/import/body.png',
        previewUrl: 'data:image/png;base64,THUMBNAIL',
        width: 1024,
        height: 1024,
      },
    })
    await openTexturePreviewWindow(tex, '/mods/car')

    const [, opts] = vi.mocked(WebviewWindow).mock.calls[0] as [string, { url: string }]
    const encoded =
      new URL(`http://x${opts.url.slice(opts.url.indexOf('?'))}`).searchParams.get('data') ?? ''
    const decoded = JSON.parse(encoded)
    expect(decoded.replacement).toEqual({
      sourcePath: '/import/body.png',
      width: 1024,
      height: 1024,
    })
    expect(decoded.replacement.previewUrl).toBeUndefined()
  })

  it('closes existing window and recreates it with fresh payload', async () => {
    const mockClose = vi.fn().mockResolvedValue(undefined)
    ;(
      WebviewWindow as unknown as { getByLabel: ReturnType<typeof vi.fn> }
    ).getByLabel.mockResolvedValue({
      close: mockClose,
    })

    const tex = makeTexture()
    await openTexturePreviewWindow(tex, '/mods/car')

    expect(mockClose).toHaveBeenCalledOnce()
    expect(WebviewWindow).toHaveBeenCalledOnce()
  })

  it('sanitizes texture id for window label', async () => {
    const tex = makeTexture({ id: 'my/texture.dds' })
    await openTexturePreviewWindow(tex, '/mods/car')

    const [label] = vi.mocked(WebviewWindow).mock.calls[0] as [string]
    expect(label).toBe('preview_my_texture_dds')
  })
})

describe('clearKn5Cache', () => {
  it('invokes clear_kn5_cache with no args', async () => {
    mockInvokeHandler('clear_kn5_cache', () => undefined)
    await clearKn5Cache()
    const { invoke } = await import('../__mocks__/tauri-api')
    expect(invoke).toHaveBeenCalledWith('clear_kn5_cache')
  })
})

describe('previewReplacementImage', () => {
  it('invokes preview_replacement_image and returns data url', async () => {
    mockInvokeHandler('preview_replacement_image', () => 'data:image/png;base64,PREVIEW')
    const { previewReplacementImage } = await import('./tauri')
    const result = await previewReplacementImage('/import/body.png')
    const { invoke } = await import('../__mocks__/tauri-api')
    expect(invoke).toHaveBeenCalledWith('preview_replacement_image', {
      imagePath: '/import/body.png',
    })
    expect(result).toBe('data:image/png;base64,PREVIEW')
  })
})

describe('getTrackHeroImage', () => {
  it('invokes get_track_hero_image with correct args and returns data url', async () => {
    mockInvokeHandler('get_track_hero_image', () => 'data:image/png;base64,HERO')
    const result = await getTrackHeroImage('/mods/spa', 'preview.png')
    const { invoke } = await import('../__mocks__/tauri-api')
    expect(invoke).toHaveBeenCalledWith('get_track_hero_image', {
      modPath: '/mods/spa',
      filename: 'preview.png',
    })
    expect(result).toBe('data:image/png;base64,HERO')
  })

  it('returns null when image is not found', async () => {
    mockInvokeHandler('get_track_hero_image', () => null)
    const result = await getTrackHeroImage('/mods/spa', 'missing.png')
    expect(result).toBeNull()
  })
})

describe('getSkinTexture', () => {
  it('invokes get_skin_texture with mod path and file path', async () => {
    mockInvokeHandler('get_skin_texture', () => 'data:image/png;base64,SKIN')
    const result = await getSkinTexture('/mods/car', '/mods/car/skins/0_default/body.dds')
    const { invoke } = await import('../__mocks__/tauri-api')
    expect(invoke).toHaveBeenCalledWith('get_skin_texture', {
      modPath: '/mods/car',
      filePath: '/mods/car/skins/0_default/body.dds',
    })
    expect(result).toBe('data:image/png;base64,SKIN')
  })
})
