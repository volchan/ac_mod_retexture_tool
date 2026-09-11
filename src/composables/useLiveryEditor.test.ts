import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLiveryDocument, loadReplacementFull } from '@/lib/tauri'
import { loadTextureImage } from '@/lib/textureImage'
import type { Texture } from '@/types/index'
import { useLiveryEditor } from './useLiveryEditor'

vi.mock('@/lib/tauri', () => ({
  loadLiveryDocument: vi.fn(async () => null),
  loadReplacementFull: vi.fn(async () => 'data:image/png;base64,REPLACEMENT'),
  saveLiveryEdit: vi.fn(),
}))

vi.mock('@/lib/textureImage', () => ({
  loadTextureImage: vi.fn(async () => 'data:image/png;base64,ORIGINAL'),
}))

const texture = { id: 'tex1', name: 'livery.png', width: 512, height: 512 } as Texture

const replaced = {
  ...texture,
  replacement: { sourcePath: '/tmp/import.png', previewUrl: '', width: 512, height: 512 },
} as Texture

function storedDocument() {
  return JSON.stringify({ textureId: 'tex1', width: 512, height: 512, layers: [] })
}

describe('useLiveryEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadLiveryDocument).mockResolvedValue(null)
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

  it('edits on top of an imported replacement rather than discarding it', async () => {
    const editor = useLiveryEditor()
    await editor.openFor(replaced, '/mods/car')
    expect(loadReplacementFull).toHaveBeenCalledWith('/tmp/import.png')
    expect(editor.baseDataUrl.value).toBe('data:image/png;base64,REPLACEMENT')
  })

  it('redraws a stored stack over the original, never over its own flattened output', async () => {
    vi.mocked(loadLiveryDocument).mockResolvedValue(storedDocument())
    const editor = useLiveryEditor()
    await editor.openFor(replaced, '/mods/car')
    expect(loadReplacementFull).not.toHaveBeenCalled()
    expect(loadTextureImage).toHaveBeenCalled()
    expect(editor.restoredDocument.value).toMatchObject({ textureId: 'tex1', layers: [] })
  })

  it('opens an untouched texture on its own pixels', async () => {
    const editor = useLiveryEditor()
    await editor.openFor(texture, '/mods/car')
    expect(editor.baseDataUrl.value).toBe('data:image/png;base64,ORIGINAL')
    expect(editor.restoredDocument.value).toBeNull()
  })

  it('drops the image when closed so a stale frame cannot be painted on', () => {
    const editor = useLiveryEditor()
    editor.open(texture, 'data:image/png;base64,AAA')
    editor.close()
    expect(editor.texture.value).toBeNull()
    expect(editor.baseDataUrl.value).toBeNull()
  })
})
