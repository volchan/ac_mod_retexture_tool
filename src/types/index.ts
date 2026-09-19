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

/**
 * One skin folder of an installed car. AC makes no distinction between skins
 * shipped with the car mod and skins installed separately afterwards.
 */
export interface SkinEntry {
  /** Folder name — the id AC uses in race.ini SKIN=. */
  name: string
  path: string
  /** `skinname` from ui_skin.json, when the skin declares one. Null, not
   * absent: the backend serializes every one of these as an `Option`. */
  displayName: string | null
  driverName: string | null
  team: string | null
  number: string | null
  country: string | null
  previewUrl: string | null
  textureCount: number
}

/** What a skin export needs: where it comes from, where the archive goes, and
 * how much of the skin travels with it. */
export interface SkinExportOptions {
  carPath: string
  skinFolder: string
  outputPath: string
  meta: SkinMeta
  /** Ship every file of the skin, rather than only what changed. */
  full: boolean
  replacements: TextureReplacementOpt[]
}

/** The ui_skin.json fields the workspace lets an author edit, plus the folder
 * name the skin is written under. Keeping the same name updates the opened
 * skin; changing it forks a new one. */
export interface SkinMeta {
  folderName: string
  skinName: string
  driverName: string
  team: string
  number: string
  country: string
}

/** Which of a skin's two display images is being written. */
export type SkinArt = 'preview' | 'livery'

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

/** `carOverride`: worn by the car but not yet repainted by this skin. Editing one
 *  writes a file of the same name into the skin, which is how AC overrides it. */
export type TextureSource = 'kn5' | 'skin' | 'carOverride'

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

export type EnhanceModel =
  | 'RealESRGAN_General_x4_v3'
  | 'realesr-animevideov3-x4'
  | '4xLSDIRCompactC3'
  | '4xNomos8kSC'
  | '4x_NMKD-Siax_200k'
export type EnhanceScale = 2 | 4

export interface EnhanceOptions {
  scale: EnhanceScale
  model: EnhanceModel
}

export interface EnhanceResult {
  outputPath: string
  previewUrl: string
  width: number
  height: number
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
  badgePath?: string
  skinPreviewPath?: string
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

export * from './editor'

/** Raw geometry of the panels wearing one texture, as base64 typed-array buffers. */
export interface CarMeshData {
  positions: string
  uvs: string
  indices: string
  vertexCount: number
  triangleCount: number
  parts: MeshRange[]
}

/** Where one original mesh sits in the merged triangle list. */
export interface MeshRange {
  name: string
  start: number
  count: number
}

/** A whole car with every texture its materials name, ready for a preview. */
export interface LiveryModel {
  mesh: CarMeshData
  groups: MaterialGroup[]
  textures: LiveryTexture[]
}

/** One run of triangles sharing a material; indices point into `textures`. */
export interface MaterialGroup {
  start: number
  count: number
  diffuse: number | null
  normal: number | null
}

export interface LiveryTexture {
  name: string
  url: string
}
