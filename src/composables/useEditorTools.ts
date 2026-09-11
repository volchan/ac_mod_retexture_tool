import { open } from '@tauri-apps/plugin-dialog'
import { ref } from 'vue'
import { useImageAssets } from '@/composables/useImageAssets'
import { createLayerId, useLiveryDocument } from '@/composables/useLiveryDocument'
import type { BrushStroke, StrokeLayer } from '@/types/index'

export type EditorTool = 'select' | 'brush' | 'eraser' | 'bucket'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']
const DEFAULT_FONT = 'Arial'
const DEFAULT_TEXT = 'Text'

const tool = ref<EditorTool>('select')
const brushSize = ref(24)
const brushColor = ref('#ffffff')
const fillColor = ref('#c8102e')
const fillTolerance = ref(32)

/// Creating a layer needs the document's size to place it, so every factory here
/// centres new content on the texture rather than at the origin.
export function useEditorTools() {
  const { document, addLayer, layers, selectedLayer, select } = useLiveryDocument()
  const { load } = useImageAssets()

  function setTool(next: EditorTool) {
    tool.value = next
    if (next !== 'select') select(null)
  }

  async function addImageLayer() {
    const picked = await open({
      multiple: false,
      filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
    })
    if (typeof picked !== 'string') return
    await addImageFromPath(picked)
  }

  /// Shared by the file picker and by files dropped onto the canvas.
  async function addImageFromPath(picked: string) {
    // Decoding here also primes the cache the canvas renders from.
    const bitmap = await load(picked)
    const size = { width: bitmap?.naturalWidth || 512, height: bitmap?.naturalHeight || 512 }
    const centre = centreOf(document.value)
    addLayer({
      id: createLayerId(),
      name: fileNameOf(picked),
      visible: true,
      opacity: 1,
      type: 'image',
      src: picked,
      width: size.width,
      height: size.height,
      x: centre.x - size.width / 2,
      y: centre.y - size.height / 2,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    })
    setTool('select')
  }

  function addTextLayer() {
    const centre = centreOf(document.value)
    const fontSize = Math.max(24, Math.round((document.value?.height ?? 1024) / 12))
    const box = textBounds(DEFAULT_TEXT, fontSize)
    addLayer({
      id: createLayerId(),
      name: 'Text',
      visible: true,
      opacity: 1,
      type: 'text',
      value: DEFAULT_TEXT,
      x: centre.x - box.width / 2,
      y: centre.y - box.height / 2,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      fontFamily: DEFAULT_FONT,
      fontSize,
      fill: '#ffffff',
      stroke: '#000000',
      strokeWidth: 0,
    })
    setTool('select')
  }

  /// Recolours the region clicked on rather than the whole sheet, so a bucket can
  /// repaint one panel of a livery. The tool stays armed: filling a car usually
  /// means clicking several panels in a row.
  function addBucketLayer(point: { x: number; y: number }) {
    addLayer({
      id: createLayerId(),
      name: 'Fill',
      visible: true,
      opacity: 1,
      type: 'bucket',
      x: Math.round(point.x),
      y: Math.round(point.y),
      tolerance: fillTolerance.value,
      color: fillColor.value,
      blend: 'source-over',
    })
  }

  /// Strokes land in the selected stroke layer when there is one, so consecutive
  /// brushing builds up a single layer instead of one per stroke.
  function strokeTarget(): StrokeLayer {
    const selected = selectedLayer.value
    if (selected?.type === 'strokes') return selected
    const existing = [...layers.value].reverse().find((l) => l.type === 'strokes')
    if (existing) return existing as StrokeLayer

    const created: StrokeLayer = {
      id: createLayerId(),
      name: 'Paint',
      visible: true,
      opacity: 1,
      type: 'strokes',
      strokes: [],
    }
    addLayer(created)
    return created
  }

  function newStroke(points: number[]): BrushStroke {
    return {
      points,
      color: brushColor.value,
      size: brushSize.value,
      erase: tool.value === 'eraser',
    }
  }

  return {
    tool,
    brushSize,
    brushColor,
    fillColor,
    fillTolerance,
    setTool,
    addImageLayer,
    addImageFromPath,
    isImagePath,
    addTextLayer,
    addBucketLayer,
    strokeTarget,
    newStroke,
  }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// Konva anchors a text node at its top-left corner, so centring it means knowing
/// how wide the glyphs actually are. Measuring beats guessing, and a canvas that
/// refuses to measure (no 2D context) falls back to the glyph count.
function textBounds(value: string, fontSize: number) {
  const height = fontSize
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return { width: value.length * fontSize * 0.5, height }
  context.font = `${fontSize}px ${DEFAULT_FONT}`
  const measured = context.measureText(value).width
  return { width: measured || value.length * fontSize * 0.5, height }
}

function centreOf(document: { width: number; height: number } | null) {
  return { x: (document?.width ?? 0) / 2, y: (document?.height ?? 0) / 2 }
}

export function isImagePath(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.includes(ext)
}

function fileNameOf(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}
