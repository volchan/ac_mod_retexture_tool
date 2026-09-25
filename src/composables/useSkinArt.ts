import { computed, ref, watch } from 'vue'
import { useSkinMeta } from '@/composables/useSkinMeta'
import { useSkinPicker } from '@/composables/useSkinPicker'
import { captureSkinPreview } from '@/composables/useSkinPreviewShot'
import { useTextures } from '@/composables/useTextures'
import { BADGE_SIZE, drawLiveryBadge, FALLBACK_COLOURS } from '@/lib/liveryBadge'
import {
  mainLiveryTexture,
  sampleTextureColours,
  type TextureBytes,
  writeSkinArt,
} from '@/lib/tauri'
import type { SkinArtPayload, Texture } from '@/types/index'

/// The two images AC shows for a skin: the entry-list badge, drawn from the
/// colours the livery wears, and the selection-screen preview, captured from
/// the 3D viewer. Drawing happens here; where the bytes land is the backend's
/// business.

/// What AC's own previews are. Anything else is scaled on the selection screen.
export const PREVIEW_SIZE = { width: 1024, height: 575 }

/// The names AC looks for, which are also the names the backend writes under.
const ART_FILES = { preview: 'preview.jpg', livery: 'livery.png' } as const

const isSaving = ref(false)
const badgeColours = ref<string[]>(FALLBACK_COLOURS)
/// Why the badge is showing fallback grey rather than the car's colours. A
/// badge that quietly gives up looks exactly like a car painted grey.
const badgeError = ref<string | null>(null)
/// What the car's own model calls the sheet it wears its livery on, lowercased
/// for comparison against however the skin spells it.
const liverySheet = ref<string | null>(null)

export function useSkinArt() {
  const { textures } = useTextures()
  const { carPath } = useSkinPicker()

  /// Which texture the badge speaks for, for the library to point at. A car
  /// carries over a hundred sheets and the one that is the livery looks like
  /// any other in a grid of thumbnails.
  const liveryTextureId = computed(
    () => liveryTexture(textures.value, liverySheet.value)?.id ?? null,
  )

  /// Asked of the model rather than worked out from the files, because the
  /// files cannot answer it. A mask ships at the livery's own resolution, and
  /// `EXT_Series_Mask.png` is the same 7168x3584 as the sheet beside it — while
  /// the sheet itself may not be in this skin's folder at all, as on a stock
  /// Kunos car that keeps it in the KN5.
  watch(
    carPath,
    async (path) => {
      liverySheet.value = null
      if (!path) return

      try {
        const sheet = await mainLiveryTexture(path)
        liverySheet.value = sheet?.toLowerCase() ?? null
      } catch (e) {
        badgeError.value = e instanceof Error ? e.message : String(e)
      }
    },
    { immediate: true },
  )

  /// Read off the pixels rather than the editor's layers: a livery is as often
  /// a dropped image as a stack of drawn shapes, and sampling covers both. A
  /// queued replacement wins, so the badge shows what a repack would produce.
  ///
  /// Watched by path rather than by the texture object: queueing a replacement
  /// repaints the car without swapping the object the list holds, and watching
  /// that object would leave the badge on the colours it was first built with.
  watch(
    () => JSON.stringify(paintedBytes(liveryTexture(textures.value, liverySheet.value))),
    async (serialised) => {
      const source: TextureBytes | null = JSON.parse(serialised)
      if (!source) {
        badgeColours.value = FALLBACK_COLOURS
        badgeError.value = null
        return
      }

      try {
        const sampled = await sampleTextureColours(source)
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
    return save(carPath, skin, 'livery', badgeDataUrl(raceNumber), {
      width: BADGE_SIZE,
      height: BADGE_SIZE,
    })
  }

  /// Both images for an archive, drawn now and written nowhere: the export
  /// carries them, so a renamed skin gets its own pictures without a folder on
  /// disk to save them into first. `failed` names the textures the preview
  /// had to do without.
  async function renderArt(
    carPath: string,
    skin: string,
    raceNumber: string,
  ): Promise<{ art: SkinArtPayload; failed: string[] }> {
    const { shot, failed } = await captureSkinPreview(carPath, skin, textures.value, PREVIEW_SIZE)
    return {
      art: { preview: payloadOf(shot), livery: payloadOf(badgeDataUrl(raceNumber)) },
      failed,
    }
  }

  function badgeDataUrl(raceNumber: string): string {
    const canvas = document.createElement('canvas')
    canvas.width = BADGE_SIZE
    canvas.height = BADGE_SIZE
    drawLiveryBadge(canvas, badgeColours.value, raceNumber)
    return canvas.toDataURL('image/png')
  }

  /// Writes `preview.jpg` from a capture the viewer already took — this has no
  /// scene of its own, and rendering one off-screen would load every texture
  /// again for a single frame.
  async function savePreview(carPath: string, skin: string, capture: string): Promise<string> {
    return save(carPath, skin, 'preview', capture, PREVIEW_SIZE)
  }

  return {
    badgeColours,
    badgeError,
    liveryTextureId,
    paintBadge,
    saveBadge,
    savePreview,
    renderArt,
    isSaving,
  }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// The sheet this skin's livery lives on.
///
/// `sheet` is what the car's own model says, lowercased, and it settles the
/// question outright — including when this skin has not repainted it, which is
/// the normal state of a stock car that keeps its livery in the KN5.
///
/// Without it, a queued replacement comes next: the author opened that texture
/// and painted it. Then size, which is at least a better guess than the
/// category — that one is read off the file name and calls anything without
/// `body` in it `other`, which is most mod cars.
export function liveryTexture(textures: Texture[], sheet?: string | null): Texture | null {
  const named = textures.find((t) => t.name.toLowerCase() === sheet)
  if (named) return named

  // The skin's own textures come first whatever their size: one it never touches
  // still wears the donor car's colours, which is not what this livery is.
  const owned = textures.filter((t) => t.replacement != null || t.source === 'skin')
  const pool = owned.length > 0 ? owned : textures

  return [...pool].sort(byPaintedThenSize)[0] ?? null
}

function byPaintedThenSize(a: Texture, b: Texture): number {
  const painted = Number(b.replacement != null) - Number(a.replacement != null)
  if (painted !== 0) return painted

  return b.width * b.height - a.width * a.height
}

/// Which pixels the badge speaks for: what the queue is about to write, else
/// what the texture is now — which for most of a car is bytes inside the KN5
/// rather than a file anyone can open.
///
/// The file on disk, never the thumbnail the webview holds: that one is 128
/// pixels wide and has already averaged the livery into one tone.
function paintedBytes(texture: Texture | null): TextureBytes | null {
  if (!texture) return null

  const queued = texture.replacement?.sourcePath
  if (queued) return { kind: 'file', path: queued }

  if (texture.kn5File) return { kind: 'embedded', kn5: texture.kn5File, name: texture.name }
  return texture.path ? { kind: 'file', path: texture.path } : null
}

async function save(
  carPath: string,
  skin: string,
  art: 'preview' | 'livery',
  dataUrl: string,
  size: { width: number; height: number },
): Promise<string> {
  // A renamed folder is a new skin that exists only once exported, and `skin`
  // is the one it was opened from: writing there would replace the donor's own
  // images inside the AC install, which nothing else in this tool touches.
  const { isFork, openedFolderName, meta } = useSkinMeta()
  if (isFork.value) {
    throw new Error(
      `${meta.value?.folderName} is a new skin — export it, or name it ${openedFolderName.value} again to update that one`,
    )
  }

  isSaving.value = true
  try {
    const written = await writeSkinArt(carPath, skin, art, payloadOf(dataUrl))
    const name = ART_FILES[art]
    // Only once the write came back: a list showing an image no file answers
    // for is worse than one showing the image that is still there.
    useTextures().putSkinArt({
      name,
      path: `skins/${skin}/${name}`,
      previewUrl: dataUrl,
      format: formatOf(dataUrl),
      ...size,
    })
    return written
  } finally {
    isSaving.value = false
  }
}

/// The scan labels these with the format it read off the bytes, so a written
/// one has to say the same thing rather than the data URL's own media type.
function formatOf(dataUrl: string): string {
  return dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
}

/// A data URL is its own header, a comma, then the base64 the backend wants.
function payloadOf(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('Not a data URL')
  return dataUrl.slice(comma + 1)
}
