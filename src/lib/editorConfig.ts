import type { BrushStroke, BucketLayer, EditorLayer, ImageLayer, TextLayer } from '@/types/index'

export const transformerConfig = {
  rotateEnabled: true,
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
  textureWidth: number
  textureHeight: number
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

/// The mask is already a full-size texture with everything outside the filled
/// region left transparent, so it draws at the origin without any placement.
function bucketConfig(layer: BucketLayer, context: LayerRenderContext) {
  return {
    id: layer.id,
    x: 0,
    y: 0,
    image: context.image,
    opacity: layer.opacity,
    globalCompositeOperation: layer.blend,
    listening: false,
  }
}

function placement(layer: ImageLayer | TextLayer, context: LayerRenderContext) {
  return {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    rotation: layer.rotation,
    opacity: layer.opacity,
    draggable: context.interactive,
    listening: context.interactive,
  }
}

/// A mirrored layer carries a negative scale. Offsetting the draw origin by the
/// layer's own size puts the mirrored pixels back in the same box, so flipping
/// never moves a sticker off the panel it was placed on.
function imageConfig(layer: ImageLayer, context: LayerRenderContext) {
  return {
    ...placement(layer, context),
    image: context.image,
    width: layer.width,
    height: layer.height,
    offsetX: layer.scaleX < 0 ? layer.width : 0,
    offsetY: layer.scaleY < 0 ? layer.height : 0,
  }
}

function textConfig(layer: TextLayer, context: LayerRenderContext) {
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
