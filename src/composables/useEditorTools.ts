import { open } from '@tauri-apps/plugin-dialog'
import { ref } from 'vue'
import { useViewCentre } from '@/composables/useEditorViewport'
import { useImageAssets } from '@/composables/useImageAssets'
import { createLayerId, useLiveryDocument } from '@/composables/useLiveryDocument'
import { textBounds } from '@/lib/editorConfig'
import type { BrushStroke, ShapeLayer, StrokeLayer } from '@/types/index'

export type EditorTool = 'select' | 'brush' | 'eraser' | 'bucket' | 'eyedropper'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'svg']
const DEFAULT_FONT = 'Arial'
const DEFAULT_TEXT = 'Text'

const tool = ref<EditorTool>('select')
const brushSize = ref(24)
const brushColor = ref('#ffffff')
const fillColor = ref('#c8102e')
const fillTolerance = ref(32)
/// What the pipette interrupted, so a sampled colour lands back in the tool the
/// user was painting with rather than making them re-arm it.
const toolBeforePick = ref<EditorTool>('select')
/// Set when a picked or dropped image will not decode. The editor watches it:
/// a composable has nowhere to put a message itself, and the same failure
/// arrives from the toolbar and from a drop.
const imageError = ref<string | null>(null)
const mirrorX = ref(false)
const mirrorY = ref(false)

/// Creating a layer needs the document's size to place it, so every factory here
/// centres new content on the texture rather than at the origin.
export function useEditorTools() {
  const { document, addLayer, layers, selectedLayer, select, holdEdits, releaseEdits } =
    useLiveryDocument()
  const { load } = useImageAssets()

  function setTool(next: EditorTool) {
    if (next === 'eyedropper' && tool.value !== 'eyedropper') toolBeforePick.value = tool.value
    tool.value = next
    if (next !== 'select') select(null)
  }

  /// Both colours follow the sample: the pipette answers "that shade there", and
  /// which tool is about to spend it is the user's next click, not this one.
  function sampleColor(hex: string) {
    fillColor.value = hex
    brushColor.value = hex
    setTool(toolBeforePick.value)
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
    // Guessing a size for a bitmap that does not exist adds a layer that can
    // never draw, sitting in the stack looking like the image was accepted.
    if (!bitmap) {
      imageError.value = `Could not read ${fileNameOf(picked)}`
      return
    }

    const size = { width: bitmap.naturalWidth, height: bitmap.naturalHeight }
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
    const box = textBounds(DEFAULT_TEXT, fontSize, DEFAULT_FONT)
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
      curve: 0,
    })
    setTool('select')
  }

  /// A new shape opens at a size that reads on the sheet whatever its resolution:
  /// a 200 pixel box is a sticker on a 1K texture and a speck on an 8K one.
  function addShapeLayer(shape: ShapeLayer['shape']) {
    const centre = centreOf(document.value)
    const size = Math.max(64, Math.round((document.value?.height ?? 1024) / 6))
    addLayer({
      id: createLayerId(),
      name: shape === 'rect' ? 'Rectangle' : 'Ellipse',
      visible: true,
      opacity: 1,
      type: 'shape',
      shape,
      x: centre.x - size / 2,
      y: centre.y - size / 2,
      width: size,
      height: size,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      fill: fillColor.value,
      stroke: '#000000',
      strokeWidth: 0,
      cornerRadius: 0,
    })
    setTool('select')
  }

  /// Recolours the region clicked on rather than the whole sheet, so a bucket can
  /// repaint one panel of a livery. The tool stays armed: filling a car usually
  /// means clicking several panels in a row.
  function addBucketLayer(point: { x: number; y: number }) {
    // One click is one undo step, however many axes it was mirrored across —
    // the way `mirrored(stroke)` already lands a mirrored brush stroke.
    holdEdits()
    for (const seed of mirroredPoints(point)) addSingleBucket(seed)
    releaseEdits()
  }

  function addSingleBucket(point: { x: number; y: number }) {
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
  /// brushing builds up a single layer instead of one per stroke. Otherwise they
  /// only join the paint layer while it is still the topmost one: appending to a
  /// buried layer draws the stroke underneath whatever was added since, and the
  /// brush looks broken.
  function strokeTarget(): StrokeLayer {
    const selected = selectedLayer.value
    if (selected?.type === 'strokes') return selected
    const top = layers.value[layers.value.length - 1]
    if (top?.type === 'strokes') return top

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

  /// A UV sheet lays the two sides of a car symmetrically, so one stroke should
  /// become two. The axis sits at the middle of the sheet, which is where the
  /// symmetry falls on every car model shipped with the game.
  function mirrored(stroke: BrushStroke): BrushStroke[] {
    const sheet = document.value
    if (!sheet || (!mirrorX.value && !mirrorY.value)) return [stroke]

    const copies = [stroke]
    if (mirrorX.value) copies.push(flip(stroke, sheet.width, 'x'))
    if (mirrorY.value) copies.push(flip(stroke, sheet.height, 'y'))
    if (mirrorX.value && mirrorY.value) {
      copies.push(flip(flip(stroke, sheet.width, 'x'), sheet.height, 'y'))
    }
    return copies
  }

  function mirroredPoints(point: { x: number; y: number }) {
    const sheet = document.value
    if (!sheet) return [point]

    const points = [point]
    if (mirrorX.value) points.push({ x: sheet.width - point.x, y: point.y })
    if (mirrorY.value) points.push({ x: point.x, y: sheet.height - point.y })
    if (mirrorX.value && mirrorY.value) {
      points.push({ x: sheet.width - point.x, y: sheet.height - point.y })
    }
    return points
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
    imageError,
    brushSize,
    brushColor,
    fillColor,
    fillTolerance,
    mirrorX,
    mirrorY,
    mirrored,
    setTool,
    addImageLayer,
    addImageFromPath,
    isImagePath,
    addTextLayer,
    addShapeLayer,
    addBucketLayer,
    sampleColor,
    strokeTarget,
    newStroke,
  }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// Mirroring reverses the coordinate across the sheet's middle; the points are a
/// flat `x, y, x, y` list, so only every other entry moves.
function flip(stroke: BrushStroke, extent: number, axis: 'x' | 'y'): BrushStroke {
  const offset = axis === 'x' ? 0 : 1
  const points = stroke.points.map((value, index) =>
    index % 2 === offset ? extent - value : value,
  )
  return { ...stroke, points }
}

/// Where a new layer opens: under the middle of the window, so it lands where
/// the author is looking. Zoomed into one door of an 8K sheet, the middle of the
/// sheet is somewhere off-screen and a sticker dropped there reads as nothing
/// having happened. Falls back to the sheet's own middle before the canvas has
/// laid out and there is no view to speak of.
function centreOf(document: { width: number; height: number } | null) {
  return useViewCentre().value ?? { x: (document?.width ?? 0) / 2, y: (document?.height ?? 0) / 2 }
}

export function isImagePath(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.includes(ext)
}

function fileNameOf(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}
