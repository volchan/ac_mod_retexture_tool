import type {
  BrushStroke,
  BucketLayer,
  EditorLayer,
  ImageLayer,
  ShapeLayer,
  TextLayer,
} from '@/types/index'

/// Angles a rotation settles on when it comes close, so a decal meant to sit
/// straight sits straight: freehand rotation never lands on a round number, and
/// a sticker one degree off reads as a mistake on a car that is symmetrical.
const ROTATION_SNAPS = Array.from({ length: 24 }, (_, step) => step * 15)

export const transformerConfig = {
  rotateEnabled: true,
  rotationSnaps: ROTATION_SNAPS,
  rotationSnapTolerance: 5,
  keepRatio: false,
  borderStroke: '#38bdf8',
  anchorStroke: '#38bdf8',
  anchorFill: '#0f172a',
  anchorSize: 10,
}

export interface LayerRenderContext {
  /// The bitmap this layer draws: the sticker for an image layer, the computed
  /// region mask for a bucket.
  image: HTMLImageElement | HTMLCanvasElement | null
  /// Where `image` belongs on the texture, for the bitmaps that are not placed
  /// by the layer itself: a bucket mask is cropped to the region it fills.
  origin?: { x: number; y: number }
  /// Layers stop listening while a paint tool is active, so a brush stroke never
  /// grabs the sticker it passes over.
  interactive: boolean
}

/// Konva node attributes for one layer. Kept out of the component so the mapping
/// stays testable without mounting a canvas.
export function layerConfig(layer: EditorLayer, context: LayerRenderContext) {
  if (layer.type === 'bucket') return bucketConfig(layer, context)
  if (layer.type === 'image') return imageConfig(layer, context)
  if (layer.type === 'text') return textConfig(layer, context)
  if (layer.type === 'shape') return shapeConfig(layer, context)
  return { id: layer.id, listening: false }
}

export function strokeConfigs(layer: { strokes: BrushStroke[]; opacity: number }) {
  return layer.strokes.map((stroke, index) => ({
    key: `${index}-${stroke.points.length}`,
    points: stroke.points,
    stroke: stroke.color,
    strokeWidth: stroke.size,
    opacity: layer.opacity,
    lineCap: 'round',
    lineJoin: 'round',
    tension: 0.35,
    listening: false,
    globalCompositeOperation: stroke.erase ? 'destination-out' : 'source-over',
  }))
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// The seed the user clicked places nothing: the mask carries its own corner,
/// wherever the fill happened to spread from there.
function bucketConfig(layer: BucketLayer, context: LayerRenderContext) {
  return {
    id: layer.id,
    x: context.origin?.x ?? 0,
    y: context.origin?.y ?? 0,
    image: context.image,
    opacity: layer.opacity,
    globalCompositeOperation: layer.blend,
    listening: false,
  }
}

/// Konva bends text along an SVG path, so the curve becomes a circular arc whose
/// radius is whatever makes the glyphs span the requested angle.
function curvedTextConfig(layer: TextLayer, context: LayerRenderContext) {
  const span = Math.abs(layer.curve) * (Math.PI / 180)
  // Konva drops every glyph running past the end of the path.
  const width = textBounds(layer.value, layer.fontSize, layer.fontFamily).width * 1.02
  const radius = width / span
  const chord = 2 * radius * Math.sin(span / 2)
  const sweep = layer.curve > 0 ? 1 : 0

  return {
    ...placement(layer, context),
    text: layer.value,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fill: layer.fill,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
    fillAfterStrokeEnabled: true,
    data: `M 0 0 A ${radius} ${radius} 0 0 ${sweep} ${chord} 0`,
  }
}

/// Konva anchors an ellipse at its centre and a rectangle at its corner; the
/// offset moves the anchor so both are placed by their top-left corner and the
/// transformer behaves the same on either. Fixed, never folded with the scale:
/// see `placement`.
function shapeConfig(layer: ShapeLayer, context: LayerRenderContext) {
  const common = {
    ...placement(layer, context),
    fill: layer.fill,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
  }
  if (layer.shape === 'rect') {
    return {
      ...common,
      width: layer.width,
      height: layer.height,
      cornerRadius: layer.cornerRadius,
    }
  }
  return {
    ...common,
    radiusX: layer.width / 2,
    radiusY: layer.height / 2,
    offsetX: -layer.width / 2,
    offsetY: -layer.height / 2,
  }
}

/// Where the node sits, and what it turns around.
///
/// The offset never moves with the scale. Folding it back on a mirror looks
/// tidy on a still layer and wrecks every gesture: the transformer works out
/// each drag from the node's own anchor, and a document that re-renders mid-drag
/// would hand it a node whose anchor had jumped a full box width the moment the
/// scale crossed zero — the handle stops matching the corner, the layer shrinks
/// to nothing over a few drags, and rotation swings it around the far corner.
///
/// Konva mirrors about the anchor and moves `x` itself to keep the opposite
/// handle where it was, which is the same result the folding was reaching for.
function placement(layer: ImageLayer | TextLayer | ShapeLayer, context: LayerRenderContext) {
  return {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    rotation: layer.rotation,
    opacity: layer.opacity,
    offsetX: 0,
    offsetY: 0,
    draggable: context.interactive,
    listening: context.interactive,
  }
}

function imageConfig(layer: ImageLayer, context: LayerRenderContext) {
  return {
    ...placement(layer, context),
    image: context.image,
    width: layer.width,
    height: layer.height,
  }
}

/// Konva anchors text at its top-left corner, so placing or mirroring one needs the
/// real glyph width. Without a 2D context, the count is all there is to go on.
export function textBounds(value: string, fontSize: number, fontFamily: string) {
  const height = fontSize
  // Wide on purpose: a short path loses glyphs, a long one just bends gentler.
  const guessed = value.length * fontSize * 0.6
  const context = measuringContext()
  if (!context) return { width: guessed, height }
  context.font = `${fontSize}px ${fontFamily}`
  return { width: context.measureText(value).width || guessed, height }
}

/// Every text layer measures itself on every render, and a fresh canvas and 2D
/// context each time is the expensive part of that. One context measures them
/// all — nothing is ever drawn into it.
let measuring: CanvasRenderingContext2D | null | undefined

function measuringContext() {
  if (measuring === undefined) {
    measuring = globalThis.document?.createElement('canvas').getContext('2d') ?? null
  }
  return measuring
}

function textConfig(layer: TextLayer, context: LayerRenderContext) {
  if (layer.curve !== 0) return curvedTextConfig(layer, context)
  return {
    ...placement(layer, context),
    text: layer.value,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fill: layer.fill,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
    fillAfterStrokeEnabled: true,
  }
}
