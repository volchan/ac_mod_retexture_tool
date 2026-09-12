import { isSafeRelativePath } from '@/lib/previewPayload'
import { getKn5Texture, getSkinTexture, getTrackHeroImage } from '@/lib/tauri'
import type { Texture } from '@/types/index'

/// Decodes a texture to a PNG data URL. Which command to use depends on where the
/// pixels live: inside a KN5, loose in a skin folder, or as a display image whose
/// path is relative to the mod root.
export async function loadTextureImage(texture: Texture, modPath: string | null): Promise<string> {
  if (texture.source !== 'skin') return getKn5Texture(texture.path, texture.name)

  if (!modPath) throw new Error('Mod path unavailable')

  if (texture.category === 'preview') {
    if (!isSafeRelativePath(texture.path)) throw new Error('Invalid texture path')
    const dataUrl = await getTrackHeroImage(modPath, texture.path)
    if (dataUrl === null) throw new Error('Preview image not found')
    return dataUrl
  }

  return getSkinTexture(modPath, texture.path)
}
