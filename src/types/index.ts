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

export interface TrackLayoutHero {
  label: string
  filename: string
  url: string | null
}

export interface RepackOptions {
  modPath: string
  outputPath: string
  meta: ModMeta
  carMeta?: CarMeta
  trackMeta?: TrackMeta
  replacements: TextureReplacement[]
}

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
