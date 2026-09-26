import type { Texture, TextureReplacementOpt } from '@/types/index'

/// What the backend needs to apply the queued edits: one entry per texture
/// carrying a replacement, saying where the bytes come from and where they go.
///
/// `kn5File` is the model the texture lives in. Without it the backend can
/// only write the edit loose beside the model, which the game never opens
/// when the texture is embedded — repack, export and Test in Game all decide
/// between patching and writing on this one field, so it is set here, once.
export function replacementOptsOf(textures: Texture[]): TextureReplacementOpt[] {
  return textures
    .filter((t) => t.replacement != null)
    .map((t) => ({
      textureId: t.id,
      sourcePath: t.replacement?.sourcePath ?? '',
      // The full path: the backend strips the mod root from it to find the
      // same model inside a copy, nested folders included.
      kn5File: t.source === 'kn5' ? t.path : undefined,
      textureName: t.name,
      skinFolder: t.skinFolder,
      originalFormat: t.format,
      heroImagePath: t.category === 'preview' ? t.path : undefined,
    }))
}
