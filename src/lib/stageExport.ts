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
  return withoutChrome(stage, width, height, pixelRatio, (options) => stage.toDataURL(options))
}

/// The same flattening without the PNG round trip. Encoding a 7168 pixel texture
/// and decoding it back into an Image costs hundreds of milliseconds, which the
/// 3D preview cannot afford while the user is still drawing the stroke.
export function stageToCanvas(
  stage: Konva.Stage,
  width: number,
  height: number,
  pixelRatio = 1,
): HTMLCanvasElement {
  return withoutChrome(stage, width, height, pixelRatio, (options) => stage.toCanvas(options))
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

function withoutChrome<T>(
  stage: Konva.Stage,
  width: number,
  height: number,
  pixelRatio: number,
  draw: (options: Record<string, unknown>) => T,
): T {
  const view = { scaleX: stage.scaleX(), scaleY: stage.scaleY(), x: stage.x(), y: stage.y() }
  const transformer = stage.findOne('Transformer') as Konva.Transformer | undefined
  const attached = transformer ? transformer.nodes() : []
  // Guides and hover markers are drawn over the livery to work against, never
  // painted into it — and the flattened result feeds the 3D preview too, so one
  // missed node ends up on the car itself.
  const chrome = stage.find('.editor-chrome')
  const wasVisible = chrome.map((node) => node.visible())

  transformer?.nodes([])
  for (const node of chrome) node.visible(false)
  stage.scale({ x: 1, y: 1 })
  stage.position({ x: 0, y: 0 })

  try {
    return draw({ x: 0, y: 0, width, height, pixelRatio, mimeType: 'image/png' })
  } finally {
    stage.scale({ x: view.scaleX, y: view.scaleY })
    stage.position({ x: view.x, y: view.y })
    transformer?.nodes(attached)
    chrome.forEach((node, index) => {
      node.visible(wasVisible[index] ?? true)
    })
  }
}

/// A thumbnail wide enough for the texture tile, whatever the texture's own size.
export function thumbnailRatio(width: number, maxSize = 256) {
  return width === 0 ? 1 : Math.min(1, maxSize / width)
}
