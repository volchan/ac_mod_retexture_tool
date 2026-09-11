import { beforeEach, describe, expect, it } from 'vitest'
import type { Texture } from '@/types/index'
import { useLiveryEditor } from './useLiveryEditor'

const texture = { id: 'tex1', name: 'livery.png', width: 512, height: 512 } as Texture

describe('useLiveryEditor', () => {
  beforeEach(() => {
    useLiveryEditor().close()
  })

  it('starts closed', () => {
    expect(useLiveryEditor().isOpen.value).toBe(false)
  })

  it('holds the texture and its decoded image once opened', () => {
    const editor = useLiveryEditor()
    editor.open(texture, 'data:image/png;base64,AAA')
    expect(editor.isOpen.value).toBe(true)
    expect(editor.texture.value).toBe(texture)
    expect(editor.baseDataUrl.value).toBe('data:image/png;base64,AAA')
  })

  it('shares one open texture across call sites', () => {
    useLiveryEditor().open(texture, 'data:image/png;base64,AAA')
    expect(useLiveryEditor().texture.value).toBe(texture)
  })

  it('drops the image when closed so a stale frame cannot be painted on', () => {
    const editor = useLiveryEditor()
    editor.open(texture, 'data:image/png;base64,AAA')
    editor.close()
    expect(editor.texture.value).toBeNull()
    expect(editor.baseDataUrl.value).toBeNull()
  })
})
