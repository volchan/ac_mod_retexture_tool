import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { ImportScanResult, Mod, ProgressInfo, RepackOptions, Texture } from '@/types/index'

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

export async function repackMod(opts: RepackOptions): Promise<void> {
  return invoke('repack_mod', { opts })
}

export async function onRepackProgress(cb: (info: ProgressInfo) => void): Promise<() => void> {
  return listen('repack-progress', (e) => cb(e.payload as ProgressInfo))
}

export async function scanImportFolder(
  importPath: string,
  modPath: string,
  textureIds: string[],
  textureNames: string[],
  textureWidths: number[],
  textureHeights: number[],
  textureKn5s: string[],
  textureSkinFolders: string[],
): Promise<ImportScanResult> {
  return invoke('scan_import_folder', {
    importPath,
    modPath,
    textureIds,
    textureNames,
    textureWidths,
    textureHeights,
    textureKn5s,
    textureSkinFolders,
  })
}
