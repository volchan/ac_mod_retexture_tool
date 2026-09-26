import { createLiveryScene } from '@/lib/liveryScene'
import { getLiveryModel } from '@/lib/tauri'
import type { Texture } from '@/types/index'

/// A picture of the car wearing this skin, taken without a viewer being open.
///
/// The preview dialog captures the scene the user framed themselves, which is
/// the better picture when there is one. This is the other path: saving a skin
/// from the sidebar, where there is no scene at all and the car has to be built,
/// photographed and thrown away for a single frame.

/// The ceiling on texture size, matching the dialog's: a 2048 sheet costs 16 MB
/// decoded and a GT names a few dozen.
const MAX_TEXTURE = 2048

export async function captureSkinPreview(
  carPath: string,
  skin: string,
  textures: Texture[],
  size: { width: number; height: number },
): Promise<SkinPreviewShot> {
  const model = await getLiveryModel(carPath, skin, MAX_TEXTURE, queuedOverrides(textures))

  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height

  const failed: string[] = []
  const scene = createLiveryScene(canvas, model, (name) => failed.push(name))
  try {
    // Nothing drives this scene, so nothing would ever have drawn the textures
    // in: the capture is the one and only frame, and it has to come after them.
    await scene.ready

    // A texture that did not load leaves its panels black, and a car where none
    // of them did is a black silhouette. Written out, that replaces a preview
    // the skin already had with one that shows nothing at all.
    if (model.textures.length > 0 && failed.length === model.textures.length) {
      throw new Error(`None of this car's ${failed.length} textures would load`)
    }

    scene.resize(size.width, size.height)
    scene.frameHero()
    return { shot: scene.capture(size.width, size.height), failed }
  } finally {
    scene.dispose()
  }
}

/// The picture, and what was missing from it. A car draws fine with one sheet
/// short, so a failure is worth saying rather than worth stopping for.
export interface SkinPreviewShot {
  shot: string
  failed: string[]
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// What the queue is about to write counts as the car's paint: a preview of the
/// files on disk would show the skin as it was before this session.
export function queuedOverrides(textures: Texture[]): [string, string][] {
  return textures.flatMap((texture) => {
    const source = texture.replacement?.sourcePath
    return source ? [[texture.name, source] as [string, string]] : []
  })
}
