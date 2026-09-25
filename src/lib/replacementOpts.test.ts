import { describe, expect, it } from 'vitest'
import type { Texture } from '@/types/index'
import { replacementOptsOf } from './replacementOpts'

function texture(overrides: Partial<Texture>): Texture {
  return {
    id: 'id',
    name: 'EXT_Panels.dds',
    path: '/car/skins/red/EXT_Panels.dds',
    source: 'skin',
    category: 'body',
    width: 4,
    height: 4,
    format: 'DDS',
    previewUrl: '',
    isDecoded: true,
    ...overrides,
  }
}

describe('replacementOptsOf', () => {
  it('leaves out textures with nothing queued', () => {
    expect(replacementOptsOf([texture({})])).toEqual([])
  })

  /// The one field export used to drop: a texture inside a model can only be
  /// applied by patching that model, and the backend needs to know which one.
  it('names the model an embedded texture lives in', () => {
    const [opt] = replacementOptsOf([
      texture({
        source: 'kn5',
        path: '/car/skins/red/led_strip_1.kn5',
        replacement: { sourcePath: '/edits/strip.png', previewUrl: '', width: 4, height: 4 },
      }),
    ])

    expect(opt.kn5File).toBe('/car/skins/red/led_strip_1.kn5')
    expect(opt.sourcePath).toBe('/edits/strip.png')
    expect(opt.heroImagePath).toBeUndefined()
  })

  it('leaves the model out for a loose file, and marks a preview image', () => {
    const [loose, preview] = replacementOptsOf([
      texture({
        skinFolder: 'red',
        replacement: { sourcePath: '/edits/a.png', previewUrl: '', width: 4, height: 4 },
      }),
      texture({
        id: 'p',
        category: 'preview',
        path: '/car/skins/red/preview.jpg',
        replacement: { sourcePath: '/edits/p.jpg', previewUrl: '', width: 4, height: 4 },
      }),
    ])

    expect(loose.kn5File).toBeUndefined()
    expect(loose.skinFolder).toBe('red')
    expect(preview.heroImagePath).toBe('/car/skins/red/preview.jpg')
  })
})
