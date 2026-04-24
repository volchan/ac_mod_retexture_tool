export type ModType = 'car' | 'track'

export interface ModMeta {
  name: string
  folderName: string
  author: string
  version: string
  description: string
}

export interface CarMeta {
  brand: string
  carClass: string
  bhp: number
  weight: number
}

export interface TrackMeta {
  country: string
  length: number
  pitboxes: number
}

export interface ModFile {
  name: string
  path: string
  fileType: 'kn5' | 'dds' | 'json' | 'folder' | 'other'
}

export interface SkinFolder {
  name: string
  path: string
  files: ModFile[]
}

export interface Mod {
  modType: ModType
  path: string
  meta: ModMeta
  carMeta?: CarMeta
  trackMeta?: TrackMeta
  files: ModFile[]
  kn5Files: string[]
  skinFolders: SkinFolder[]
}

export type TextureCategory =
  | 'all'
  | 'body'
  | 'livery'
  | 'interior'
  | 'wheels'
  | 'road'
  | 'terrain'
  | 'buildings'
  | 'props'
  | 'sky'
  | 'other'
  | 'preview'

export type TextureSource = 'kn5' | 'skin'

export interface Texture {
  id: string
  name: string
  path: string
  source: TextureSource
  kn5File?: string
  skinFolder?: string
  category: TextureCategory
  width: number
  height: number
  format: string
  previewUrl: string
  isDecoded: boolean
  replacement?: TextureReplacement
}

export interface TextureReplacement {
  sourcePath: string
  previewUrl: string
  width: number
  height: number
}

export interface ProgressInfo {
  current: number
  total: number
  label: string
}

export interface TextureReplacementOpt {
  textureId: string
  sourcePath: string
  kn5File?: string
  textureName: string
  skinFolder?: string
  originalFormat: string
  heroImagePath?: string
}

export interface RepackOptions {
  modPath: string
  outputPath: string
  meta: ModMeta
  carMeta?: CarMeta
  trackMeta?: TrackMeta
  replacements: TextureReplacementOpt[]
}

/** Raw IPC response from scan_import_folder — textureId is resolved to Texture after the call. */
export interface MatchedTextureRaw {
  textureId: string
  sourcePath: string
  previewUrl: string
  sourceWidth: number
  sourceHeight: number
  hasDimensionMismatch: boolean
}

/** Hydrated match with the full Texture object, used in UI components. */
export interface MatchedTexture {
  texture: Texture
  sourcePath: string
  previewUrl: string
  sourceWidth: number
  sourceHeight: number
  hasDimensionMismatch: boolean
}

export interface UnmatchedFile {
  name: string
  reason: string
}

export interface ImportScanResult {
  matched: MatchedTextureRaw[]
  unmatched: UnmatchedFile[]
}

export type TextureDensity = 'sm' | 'md' | 'lg'

export type AccentKey = 'cobalt' | 'crimson' | 'papaya' | 'brg'

export interface AcInstall {
  path: string
  detectedAt: string
  source: 'auto' | 'manual' | 'env'
  version?: string
}

export interface AcInstallInfo {
  path: string
  version?: string
  carCount: number
  trackCount: number
}

export interface AcProbeResult {
  path: string
  label: string
  status: 'pending' | 'active' | 'hit' | 'miss'
}

export type AcDetectPhase = 'idle' | 'detecting' | 'detected' | 'not_found'

export interface LibraryEntry {
  id: string
  modType: ModType
  path: string
  name: string
  isKunos: boolean
  author?: string
  textureCount: number
  brand?: string
  bhp?: number
  weight?: number
  year?: number
  skinCount?: number
  country?: string
  length?: number
  pitboxes?: number
  layouts?: number
}

export interface RecentMod {
  id: string
  modType: ModType
  name: string
  folderName: string
  path: string
  lastOpenedAt: number
  author?: string
  textureCount?: number
  trackLength?: number
  pitboxes?: number
  country?: string
  carBhp?: number
  carBrand?: string
}
