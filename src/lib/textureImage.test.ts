import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/tauri', () => ({
  getKn5Texture: vi.fn(async () => 'data:png,kn5'),
  getSkinTexture: vi.fn(async () => 'data:png,skin'),
  getTrackHeroImage: vi.fn(async () => 'data:png,hero'),
}))

import { getKn5Texture, getSkinTexture, getTrackHeroImage } from '@/lib/tauri'
import type { Texture } from '@/types/index'
import { loadTextureImage } from './textureImage'

function texture(overrides: Partial<Texture>): Texture {
  return {
    id: 't1',
    name: 'body.dds',
    path: '/mods/car/car.kn5',
    source: 'kn5',
    category: 'body',
    width: 1024,
    height: 1024,
    format: 'BC1',
    isDecoded: true,
    ...overrides,
  } as Texture
}

describe('loadTextureImage', () => {
  it('reads a KN5 texture by archive path and name', async () => {
    expect(await loadTextureImage(texture({}), '/mods/car')).toBe('data:png,kn5')
    expect(getKn5Texture).toHaveBeenCalledWith('/mods/car/car.kn5', 'body.dds')
  })

  it('reads a loose skin texture relative to the mod root', async () => {
    const tex = texture({ source: 'skin', path: 'skins/red_01/body.dds', skinFolder: 'red_01' })
    expect(await loadTextureImage(tex, '/mods/car')).toBe('data:png,skin')
    expect(getSkinTexture).toHaveBeenCalledWith('/mods/car', 'skins/red_01/body.dds')
  })

  it('reads a display image through the hero image command', async () => {
    const tex = texture({ source: 'skin', category: 'preview', path: 'skins/red_01/livery.png' })
    expect(await loadTextureImage(tex, '/mods/car')).toBe('data:png,hero')
    expect(getTrackHeroImage).toHaveBeenCalledWith('/mods/car', 'skins/red_01/livery.png')
  })

  it('refuses a display image whose path escapes the mod root', async () => {
    const tex = texture({ source: 'skin', category: 'preview', path: '../../etc/passwd' })
    await expect(loadTextureImage(tex, '/mods/car')).rejects.toThrow('Invalid texture path')
  })

  it('reports a missing display image rather than returning null', async () => {
    vi.mocked(getTrackHeroImage).mockResolvedValueOnce(null)
    const tex = texture({ source: 'skin', category: 'preview', path: 'skins/red_01/livery.png' })
    await expect(loadTextureImage(tex, '/mods/car')).rejects.toThrow('Preview image not found')
  })

  it('needs a mod root for any skin texture', async () => {
    const tex = texture({ source: 'skin', path: 'skins/red_01/body.dds' })
    await expect(loadTextureImage(tex, null)).rejects.toThrow('Mod path unavailable')
  })
})
