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
