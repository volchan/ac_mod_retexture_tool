import type Konva from 'konva'

/// Renders the stage at texture resolution rather than at the zoom the user
/// happens to be at, and without the selection handles, which are chrome rather
/// than part of the livery.
export function flattenStage(
  stage: Konva.Stage,
  width: number,
  height: number,
  pixelRatio = 1,
): string {
  const view = { scaleX: stage.scaleX(), scaleY: stage.scaleY(), x: stage.x(), y: stage.y() }
  const transformer = stage.findOne('Transformer') as Konva.Transformer | undefined
  const attached = transformer ? transformer.nodes() : []

  transformer?.nodes([])
  stage.scale({ x: 1, y: 1 })
  stage.position({ x: 0, y: 0 })

  try {
    return stage.toDataURL({ x: 0, y: 0, width, height, pixelRatio, mimeType: 'image/png' })
  } finally {
    stage.scale({ x: view.scaleX, y: view.scaleY })
    stage.position({ x: view.x, y: view.y })
    transformer?.nodes(attached)
  }
}

/// A thumbnail wide enough for the texture tile, whatever the texture's own size.
export function thumbnailRatio(width: number, maxSize = 256) {
  return width === 0 ? 1 : Math.min(1, maxSize / width)
}
