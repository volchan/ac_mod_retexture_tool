import { ref, watch } from 'vue'
import { useTextures } from '@/composables/useTextures'
import { BADGE_SIZE, drawLiveryBadge, FALLBACK_COLOURS } from '@/lib/liveryBadge'
import { writeSkinArt } from '@/lib/tauri'
import { sampleColours } from '@/lib/textureColours'
import type { Texture } from '@/types/index'

/// The two images AC shows for a skin: the entry-list badge, drawn from the
/// colours the livery wears, and the selection-screen preview, captured from
/// the 3D viewer. Drawing happens here; where the bytes land is the backend's
/// business.

/// What AC's own previews are. Anything else is scaled on the selection screen.
export const PREVIEW_SIZE = { width: 1024, height: 575 }

const isSaving = ref(false)
const badgeColours = ref<string[]>(FALLBACK_COLOURS)
/// Why the badge is showing fallback grey rather than the car's colours. A
/// badge that quietly gives up looks exactly like a car painted grey.
const badgeError = ref<string | null>(null)

export function useSkinArt() {
  const { textures } = useTextures()

  /// Read off the pixels rather than the editor's layers: a livery is as often
  /// a dropped image as a stack of drawn shapes, and sampling covers both. A
  /// queued replacement wins, so the badge shows what a repack would produce.
  // Watched by the pixels rather than by the texture: queueing a replacement
  // repaints the car without swapping the object the list holds, and watching
  // that object would leave the badge on the colours it was first built with.
  watch(
    () => paintedSource(liveryTexture(textures.value)),
    async (source) => {
      if (!source) {
        badgeColours.value = FALLBACK_COLOURS
        badgeError.value = null
        return
      }

      try {
        const sampled = sampleColours(await decoded(source))
        badgeColours.value = sampled.length > 0 ? sampled : FALLBACK_COLOURS
        badgeError.value = sampled.length > 0 ? null : 'Nothing painted on this texture'
      } catch (e) {
        badgeColours.value = FALLBACK_COLOURS
        badgeError.value = e instanceof Error ? e.message : String(e)
      }
    },
    { immediate: true },
  )

  function paintBadge(canvas: HTMLCanvasElement, raceNumber: string): void {
    drawLiveryBadge(canvas, badgeColours.value, raceNumber)
  }

  /// Writes `livery.png` into the skin folder. The badge is redrawn here rather
  /// than read off whatever canvas the panel is showing, so what lands on disk
  /// does not depend on the sidebar being open.
  async function saveBadge(carPath: string, skin: string, raceNumber: string): Promise<string> {
    const canvas = document.createElement('canvas')
    canvas.width = BADGE_SIZE
    canvas.height = BADGE_SIZE
    drawLiveryBadge(canvas, badgeColours.value, raceNumber)

    return save(carPath, skin, 'livery', canvas.toDataURL('image/png'))
  }

  /// Writes `preview.jpg` from a capture the viewer already took — this has no
  /// scene of its own, and rendering one off-screen would load every texture
  /// again for a single frame.
  async function savePreview(carPath: string, skin: string, capture: string): Promise<string> {
    return save(carPath, skin, 'preview', capture)
  }

  return { badgeColours, badgeError, paintBadge, saveBadge, savePreview, isSaving }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// The biggest sheet this skin actually paints on.
///
/// Size alone decides, deliberately. The category looks like the better filter
/// and is not: it is guessed from the file name and calls anything without
/// `body` in it `other`, which is most mod cars — `2026_Chassis_P.dds` carries
/// a whole livery and lands there, where a `body_detail` sheet a fourteenth its
/// size would have outranked it on a name.
///
/// The skin's own textures come first whatever their size: one it never touches
/// still wears the donor car's colours, which is not what this livery looks like.
export function liveryTexture(textures: Texture[]): Texture | null {
  const owned = textures.filter((t) => t.replacement != null || t.source === 'skin')
  const pool = owned.length > 0 ? owned : textures

  return [...pool].sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null
}

/// Which pixels the badge speaks for: what the queue is about to write, else
/// what is on the texture now.
function paintedSource(texture: Texture | null): string | null {
  if (!texture) return null
  return texture.replacement?.previewUrl || texture.previewUrl || null
}

function decoded(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not read ${source.slice(0, 32)}`))
    image.src = source
  })
}

async function save(
  carPath: string,
  skin: string,
  art: 'preview' | 'livery',
  dataUrl: string,
): Promise<string> {
  isSaving.value = true
  try {
    return await writeSkinArt(carPath, skin, art, payloadOf(dataUrl))
  } finally {
    isSaving.value = false
  }
}

/// A data URL is its own header, a comma, then the base64 the backend wants.
function payloadOf(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('Not a data URL')
  return dataUrl.slice(comma + 1)
}
