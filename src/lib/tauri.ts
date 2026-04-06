import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Mod, ProgressInfo, Texture } from '@/types/index'

export async function scanModFolder(path: string): Promise<Mod> {
  return invoke('scan_mod_folder', { path })
}

export async function decodeModTextures(modPath: string, modType: string): Promise<Texture[]> {
  return invoke('decode_mod_textures', { modPath, modType })
}

export async function onDecodeProgress(cb: (info: ProgressInfo) => void): Promise<() => void> {
  return listen('decode-progress', (e) => cb(e.payload as ProgressInfo))
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
