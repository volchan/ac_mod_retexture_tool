import { computed, ref } from 'vue'
import { useBucketMasks } from '@/composables/useBucketMasks'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import { BADGE_SIZE, drawLiveryBadge } from '@/lib/liveryBadge'
import { dominantColours } from '@/lib/liveryColours'
import { writeSkinArt } from '@/lib/tauri'

/// The two images AC shows for a skin: the entry-list badge, drawn from the
/// colours the livery wears, and the selection-screen preview, captured from
/// the 3D viewer. Drawing happens here; where the bytes land is the backend's
/// business.

/// What AC's own previews are. Anything else is scaled on the selection screen.
export const PREVIEW_SIZE = { width: 1024, height: 575 }

const isSaving = ref(false)

export function useSkinArt() {
  const { layers } = useLiveryDocument()
  const { maskAreas } = useBucketMasks()

  /// The two colours the badge is painted with, in the order they cover the
  /// texture. Recomputed with the layer stack, which is also when a fill's mask
  /// is rebuilt, so the areas behind them are never a stack out of date.
  const badgeColours = computed(() => dominantColours(layers.value, maskAreas()))

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

  return { badgeColours, paintBadge, saveBadge, savePreview, isSaving }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

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
