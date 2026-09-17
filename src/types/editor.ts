/// Blend modes Konva maps straight onto the canvas compositing operation.
export type BlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay'

export interface LayerCommon {
  id: string
  name: string
  visible: boolean
  opacity: number
}

export interface Placement {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
}

export interface ImageLayer extends LayerCommon, Placement {
  type: 'image'
  /// Absolute path on disk, reloaded when the document is reopened.
  src: string
  width: number
  height: number
}

export interface TextLayer extends LayerCommon, Placement {
  type: 'text'
  value: string
  fontFamily: string
  fontSize: number
  fill: string
  stroke: string
  strokeWidth: number
  /// Arc the baseline bends through, in degrees. Zero draws a straight line;
  /// negative curves the other way. A livery name follows a bumper, not a ruler.
  curve: number
}

/// A drawn primitive rather than an imported one: the stripes, blocks and dots a
/// livery is built from, kept as numbers so they stay crisp at any texture size.
export interface ShapeLayer extends LayerCommon, Placement {
  type: 'shape'
  shape: 'rect' | 'ellipse'
  width: number
  height: number
  fill: string
  stroke: string
  strokeWidth: number
  cornerRadius: number
}

/// A paint bucket: only the seed point and the tolerance are stored, never the
/// region it covers. The mask is recomputed from the base texture on demand, so
/// an undo snapshot stays a handful of numbers instead of a megapixel bitmap.
export interface BucketLayer extends LayerCommon {
  type: 'bucket'
  /// Seed point in texture pixels.
  x: number
  y: number
  /// Maximum RGB distance from the seed colour a pixel may have and still join
  /// the region.
  tolerance: number
  color: string
  blend: BlendMode
}

export interface BrushStroke {
  /// Flat x,y pairs in texture pixels, the shape Konva.Line expects.
  points: number[]
  color: string
  size: number
  erase: boolean
}

export interface StrokeLayer extends LayerCommon {
  type: 'strokes'
  strokes: BrushStroke[]
}

export type EditorLayer = ImageLayer | TextLayer | ShapeLayer | BucketLayer | StrokeLayer
export type LayerType = EditorLayer['type']

/// The base texture is never a layer: it is always the bottom of the stack and
/// cannot be moved or hidden, so keeping it out of the list removes every guard
/// that would otherwise protect it.
export interface LiveryDocument {
  textureId: string
  width: number
  height: number
  layers: EditorLayer[]
}

export interface LiveryEditSave {
  textureKey: string
  pngBase64: string
  documentJson: string
}
