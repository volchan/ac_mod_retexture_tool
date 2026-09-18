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
  const sheet = { x: 0, y: 0, width, height }
  return withoutChrome(stage, sheet, pixelRatio, (options) => stage.toDataURL(options))
}

/// The colour the livery actually shows at one texture pixel, guides and markers
/// excluded. Rendered as a one pixel crop rather than read back from the visible
/// layer: the sheet is drawn at whatever zoom the user is at, and the overlays
/// they work against would tint the sample.
export function pickColor(stage: Konva.Stage, x: number, y: number): string | null {
  const pixel = { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 }
  const canvas = withoutChrome(stage, pixel, 1, (options) => stage.toCanvas(options))
  const context = canvas.getContext('2d')
  if (!context) return null

  const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data
  if (alpha === 0) return null
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
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
  const sheet = { x: 0, y: 0, width, height }
  return withoutChrome(stage, sheet, pixelRatio, (options) => stage.toCanvas(options))
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

interface Crop {
  x: number
  y: number
  width: number
  height: number
}

function withoutChrome<T>(
  stage: Konva.Stage,
  crop: Crop,
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
    return draw({ ...crop, pixelRatio, mimeType: 'image/png' })
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
