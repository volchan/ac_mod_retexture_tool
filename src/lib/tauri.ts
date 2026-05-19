import { getVersion } from '@tauri-apps/api/app'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

export { convertFileSrc }

import { save } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import type {
  AcInstallInfo,
  EnhanceOptions,
  EnhanceResult,
  ImportScanResult,
  LibraryEntry,
  Mod,
  ProgressInfo,
  RepackOptions,
  Texture,
  TextureReplacementOpt,
} from '@/types/index'

export interface AcDetectResult {
  candidates: Array<{
    path: string
    label: string
    source: string
    version?: string
    carCount: number
    trackCount: number
  }>
}

export async function detectAcInstall(): Promise<AcDetectResult> {
  return invoke('detect_ac_install')
}

export async function validateAcFolder(path: string): Promise<AcInstallInfo> {
  return invoke('validate_ac_folder', { path })
}

export async function listAcContent(path: string): Promise<LibraryEntry[]> {
  return invoke('list_ac_content', { path })
}

export async function listAcCars(acPath: string): Promise<LibraryEntry[]> {
  return invoke('list_ac_cars', { acPath })
}

export async function testInGame(
  acPath: string,
  modPath: string,
  carId: string,
  replacements: TextureReplacementOpt[],
): Promise<void> {
  return invoke('test_in_game', { acPath, modPath, carId, replacements })
}

export async function onAcProbe(
  cb: (event: { path: string; label: string; status: string }) => void,
): Promise<() => void> {
  return listen('ac-probe', (e) => cb(e.payload as { path: string; label: string; status: string }))
}

export async function onAcLibraryEntry(cb: (entry: LibraryEntry) => void): Promise<() => void> {
  return listen('ac-library-entry', (e) => cb(e.payload as LibraryEntry))
}

export async function getAppVersion(): Promise<string> {
  return getVersion()
}

export async function openExternalUrl(url: string): Promise<void> {
  return openUrl(url)
}

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

export async function showSaveDialog(defaultName: string): Promise<string | null> {
  return save({
    defaultPath: defaultName,
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  })
}

export async function repackMod(opts: RepackOptions): Promise<void> {
  return invoke('repack_mod', { opts })
}

export async function onRepackProgress(cb: (info: ProgressInfo) => void): Promise<() => void> {
  return listen('repack-progress', (e) => cb(e.payload as ProgressInfo))
}

export async function clearKn5Cache(): Promise<void> {
  return invoke('clear_kn5_cache')
}

export async function previewReplacementImage(imagePath: string): Promise<string> {
  return invoke('preview_replacement_image', { imagePath })
}

export async function loadReplacementFull(imagePath: string): Promise<string> {
  return invoke('load_replacement_full', { imagePath })
}

export async function getKn5Texture(kn5Path: string, textureName: string): Promise<string> {
  return invoke('get_kn5_texture', { kn5Path, textureName })
}

export async function getSkinTexture(modPath: string, filePath: string): Promise<string> {
  return invoke('get_skin_texture', { modPath, filePath })
}

export async function getTrackHeroImage(modPath: string, filename: string): Promise<string | null> {
  return invoke('get_track_hero_image', { modPath, filename })
}

export async function openTexturePreviewWindow(texture: Texture, modPath: string): Promise<void> {
  const label = `preview_${texture.id.replace(/[^a-zA-Z0-9]/g, '_')}`

  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    await existing.close()
  }

  const payload = {
    id: texture.id,
    name: texture.name,
    path: texture.path,
    source: texture.source,
    kn5File: texture.kn5File,
    skinFolder: texture.skinFolder,
    category: texture.category,
    width: texture.width,
    height: texture.height,
    format: texture.format,
    modPath,
    replacement: texture.replacement
      ? {
          sourcePath: texture.replacement.sourcePath,
          width: texture.replacement.width,
          height: texture.replacement.height,
        }
      : undefined,
  }

  new WebviewWindow(label, {
    url: `/?preview=1&data=${encodeURIComponent(JSON.stringify(payload))}`,
    title: texture.name,
    width: 1368,
    height: 855,
    minWidth: 640,
    minHeight: 480,
    resizable: true,
  })
}

export async function onEnhanceProgress(cb: (info: ProgressInfo) => void): Promise<() => void> {
  return listen('enhance-progress', (e) => cb(e.payload as ProgressInfo))
}

export async function enhanceExtractedTextures(
  outputDir: string,
  modName: string,
  textureNames: string[],
  textureKn5s: string[],
  textureSkinFolders: string[],
  scale: EnhanceOptions['scale'],
  model: EnhanceOptions['model'],
): Promise<string[]> {
  return invoke('enhance_extracted_textures', {
    outputDir,
    modName,
    textureNames,
    textureKn5s,
    textureSkinFolders,
    scale,
    model,
  })
}

export async function enhanceTexture(
  texture: Texture,
  modPath: string,
  opts: EnhanceOptions,
): Promise<EnhanceResult> {
  return invoke('enhance_texture', {
    source: texture.source,
    texturePath: texture.path,
    textureName: texture.name,
    modPath,
    scale: opts.scale,
    model: opts.model,
  })
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
