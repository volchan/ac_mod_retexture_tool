import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Mod, ProgressInfo, Texture, TrackLayoutHero } from '@/types/index'

export async function scanModFolder(path: string): Promise<Mod> {
  return invoke('scan_mod_folder', { path })
}

export async function decodeModTextures(modPath: string, modType: string): Promise<void> {
  return invoke('decode_mod_textures', { modPath, modType })
}

export async function cancelDecode(): Promise<void> {
  return invoke('cancel_decode')
}

export async function onDecodeTexture(cb: (tex: Texture) => void): Promise<() => void> {
  return listen('decode-texture', (e) => cb(e.payload as Texture))
}

export async function onDecodeProgress(cb: (info: ProgressInfo) => void): Promise<() => void> {
  return listen('decode-progress', (e) => cb(e.payload as ProgressInfo))
}

export async function extractTextures(
  modPath: string,
  textureNames: string[],
  textureKn5s: string[],
  textureSkinFolders: string[],
  textureIds: string[],
  outputDir: string,
): Promise<string[]> {
  return invoke('extract_textures', {
    modPath,
    textureIds,
    textureNames,
    textureKn5s,
    textureSkinFolders,
    outputDir,
  })
}

export async function onExtractProgress(cb: (info: ProgressInfo) => void): Promise<() => void> {
  return listen('extract-progress', (e) => cb(e.payload as ProgressInfo))
}

export async function listTrackHeroImages(modPath: string): Promise<TrackLayoutHero[]> {
  return invoke('list_track_hero_images', { modPath })
}

export async function getTrackHeroImage(modPath: string, filename: string): Promise<string | null> {
  return invoke('get_track_hero_image', { modPath, filename })
}

export async function extractTrackHeroImage(
  modPath: string,
  filename: string,
  outputPath: string,
): Promise<void> {
  return invoke('extract_track_hero_image', { modPath, filename, outputPath })
}

export async function previewReplacementImage(imagePath: string): Promise<string> {
  return invoke('preview_replacement_image', { imagePath })
}
