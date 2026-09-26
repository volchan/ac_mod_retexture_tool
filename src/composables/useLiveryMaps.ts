import type Konva from 'konva'
import { ref } from 'vue'
import { useTextures } from '@/composables/useTextures'
import { textureStableKey } from '@/lib/replacementStore'
import { coverageToCanvas } from '@/lib/stageExport'
import { cleanLiveryMaps, liveryMaps } from '@/lib/tauri'
import { originalBytes, paintedBytes } from '@/lib/textureBytes'
import type { EditorLayer, MatchedTexture, Texture } from '@/types/index'

/// What the backend names a finish it cleaned. Such a finish is always rebuilt
/// from the car's own, so a sticker taken off the sheet gives its panel back.
const CLEANED_SUFFIX = '.clean.png'

const isClearing = ref(false)

/// A skin author who ran their decals through the car's finish texture leaves
/// every sponsor there as a change of shine, and new paint over the colour
/// sheet hides its colour and nothing else. This clears the finish under the
/// editor's paint, so the old lettering stops catching the light through it.
export function useLiveryMaps() {
  const { textures, applyReplacements } = useTextures()

  /// Queues a cleaned copy of every finish the model pairs with `sheet`, and
  /// returns their names.
  async function clearUnder(
    stage: Konva.Stage,
    sheet: Texture,
    carPath: string,
    layers: EditorLayer[],
  ): Promise<string[]> {
    isClearing.value = true
    try {
      const paired = await liveryMaps(carPath, sheet.name)
      const targets = textures.value.filter((texture) => pairs(texture, sheet, paired))
      if (targets.length === 0) {
        return []
      }

      const coverage = coverageToCanvas(stage, sheet.width, sheet.height, tintIds(layers))
      const coverageUrl = coverage.toDataURL('image/png')

      const cleaned: MatchedTexture[] = []
      for (const maps of targets) {
        cleaned.push(await clean(maps, coverageUrl))
      }
      applyReplacements(cleaned)
      return targets.map((maps) => maps.name)
    } finally {
      isClearing.value = false
    }
  }

  return { isClearing, clearUnder }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// A finish only shares the sheet's layout at the sheet's own size; `Gen_Map`
/// style textures the model also pairs with it are laid out for something else.
function pairs(texture: Texture, sheet: Texture, paired: string[]): boolean {
  const named = paired.some((name) => name.toLowerCase() === texture.name.toLowerCase())
  return named && texture.width === sheet.width && texture.height === sheet.height
}

/// Layers that recolour what is under them rather than hide it. A whole-sheet
/// fill covers everything, and flattening every panel's finish to one would
/// turn the carbon and the chrome into paint.
function tintIds(layers: EditorLayer[]): string[] {
  return layers
    .filter(
      (layer) =>
        layer.type === 'bucket' && (layer.blend !== 'source-over' || layer.mode === 'sheet'),
    )
    .map((layer) => layer.id)
}

async function clean(maps: Texture, coverage: string): Promise<MatchedTexture> {
  const source = cleanedBefore(maps) ? originalBytes(maps) : paintedBytes(maps)
  if (!source) {
    throw new Error(`${maps.name} has no file or model to read its finish from`)
  }

  const { sourcePath, previewUrl } = await cleanLiveryMaps(
    source,
    textureStableKey(maps.name, maps.path),
    coverage,
  )
  return {
    texture: maps,
    sourcePath,
    previewUrl,
    sourceWidth: maps.width,
    sourceHeight: maps.height,
    hasDimensionMismatch: false,
  }
}

function cleanedBefore(maps: Texture): boolean {
  return maps.replacement?.sourcePath.endsWith(CLEANED_SUFFIX) ?? false
}
