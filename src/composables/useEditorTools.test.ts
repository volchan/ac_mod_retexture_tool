import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
vi.mock('@/lib/tauri', () => ({
  loadReplacementFull: vi.fn(async () => 'data:image/png;base64,AAA'),
}))

import { open } from '@tauri-apps/plugin-dialog'
import type { StrokeLayer, Texture } from '@/types/index'
import { useEditorTools } from './useEditorTools'
import { useLiveryDocument } from './useLiveryDocument'

const texture = { id: 'tex1', name: 'skin_body.dds', width: 2048, height: 1024 } as Texture

// jsdom never actually loads an image, so nothing would resolve the size probe.
class StubImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 300
  naturalHeight = 100
  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}

describe('useEditorTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('Image', StubImage)
    useLiveryDocument().init(texture)
    useEditorTools().setTool('select')
  })

  it('drops the selection when a paint tool takes over', () => {
    const doc = useLiveryDocument()
    const tools = useEditorTools()
    tools.addTextLayer()
    expect(doc.selectedLayer.value).not.toBeNull()

    tools.setTool('brush')
    expect(doc.selectedLayer.value).toBeNull()
  })

  it('centres a new text layer on the texture', () => {
    const tools = useEditorTools()
    tools.addTextLayer()
    expect(useLiveryDocument().layers.value[0]).toMatchObject({ type: 'text', x: 1024, y: 512 })
  })

  it('scales the default font to the texture height', () => {
    useEditorTools().addTextLayer()
    const layer = useLiveryDocument().layers.value[0]
    expect(layer.type === 'text' && layer.fontSize).toBe(85)
  })

  it('drops a fill at the point that was clicked, not over the whole sheet', () => {
    useEditorTools().addBucketLayer({ x: 640.4, y: 128.6 })
    expect(useLiveryDocument().layers.value[0]).toMatchObject({
      type: 'bucket',
      x: 640,
      y: 129,
      tolerance: 32,
      blend: 'source-over',
    })
  })

  it('stays on the bucket after a fill so several panels can be painted in a row', () => {
    const tools = useEditorTools()
    tools.setTool('bucket')
    tools.addBucketLayer({ x: 10, y: 10 })
    expect(tools.tool.value).toBe('bucket')
  })

  it('ignores a cancelled image picker', async () => {
    vi.mocked(open).mockResolvedValueOnce(null)
    await useEditorTools().addImageLayer()
    expect(useLiveryDocument().layers.value).toEqual([])
  })

  it('names an image layer after its file and centres it', async () => {
    vi.mocked(open).mockResolvedValueOnce('/tmp/sponsors/shell.png')
    await useEditorTools().addImageLayer()

    const layer = useLiveryDocument().layers.value[0]
    expect(layer.name).toBe('shell.png')
    expect(layer).toMatchObject({
      type: 'image',
      width: 300,
      height: 100,
      x: 1024 - 150,
      y: 512 - 50,
    })
  })

  it('accepts the image formats a skinner actually ships', () => {
    const tools = useEditorTools()
    expect(tools.isImagePath('/a/Sponsor.PNG')).toBe(true)
    expect(tools.isImagePath('/a/logo.webp')).toBe(true)
    expect(tools.isImagePath('/a/notes.txt')).toBe(false)
    expect(tools.isImagePath('/a/nodots')).toBe(false)
  })

  it('adds a dropped file without going through the picker', async () => {
    await useEditorTools().addImageFromPath('/tmp/sponsors/shell.png')
    expect(useLiveryDocument().layers.value[0]).toMatchObject({
      type: 'image',
      name: 'shell.png',
    })
    expect(open).not.toHaveBeenCalled()
  })

  it('returns to the select tool after adding a layer', () => {
    const tools = useEditorTools()
    tools.setTool('brush')
    tools.addTextLayer()
    expect(tools.tool.value).toBe('select')
  })

  it('creates a paint layer the first time a stroke lands', () => {
    const target = useEditorTools().strokeTarget()
    expect(target.type).toBe('strokes')
    expect(useLiveryDocument().layers.value).toHaveLength(1)
  })

  it('keeps brushing into the same paint layer', () => {
    const tools = useEditorTools()
    const first = tools.strokeTarget()
    const second = tools.strokeTarget()
    expect(second.id).toBe(first.id)
    expect(useLiveryDocument().layers.value).toHaveLength(1)
  })

  it('reuses the paint layer even when another kind of layer is selected', () => {
    const tools = useEditorTools()
    const paint = tools.strokeTarget()
    tools.addTextLayer()

    const again: StrokeLayer = tools.strokeTarget()
    expect(again.id).toBe(paint.id)
    expect(useLiveryDocument().layers.value).toHaveLength(2)
  })

  it('marks a stroke as erasing only when the eraser is active', () => {
    const tools = useEditorTools()
    expect(tools.newStroke([0, 0]).erase).toBe(false)
    tools.setTool('eraser')
    expect(tools.newStroke([0, 0]).erase).toBe(true)
  })

  it('stamps the current brush size and colour onto a stroke', () => {
    const tools = useEditorTools()
    tools.brushSize.value = 64
    tools.brushColor.value = '#00ff00'
    expect(tools.newStroke([1, 2])).toMatchObject({ size: 64, color: '#00ff00', points: [1, 2] })
  })
})
