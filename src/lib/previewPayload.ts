import type { Texture, TextureReplacement } from '@/types/index'

export type ReplacementPayload = Omit<TextureReplacement, 'previewUrl'> & { previewUrl?: string }
export type TexturePreviewPayload = Omit<Texture, 'previewUrl' | 'isDecoded' | 'replacement'> & {
  modPath?: string
  replacement?: ReplacementPayload
}

export function isSafeRelativePath(p: string): boolean {
  if (p.includes('\\')) return false
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return false
  return !p.split('/').includes('..')
}

export function isValidPayload(p: unknown): p is TexturePreviewPayload {
  if (typeof p !== 'object' || p === null) return false
  const o = p as Record<string, unknown>
  if (
    typeof o.id !== 'string' ||
    o.id.length === 0 ||
    typeof o.name !== 'string' ||
    o.name.length === 0 ||
    typeof o.path !== 'string' ||
    (o.source !== 'kn5' && o.source !== 'skin') ||
    typeof o.width !== 'number' ||
    typeof o.height !== 'number' ||
    typeof o.format !== 'string' ||
    typeof o.category !== 'string'
  )
    return false
  if (o.source === 'skin' && typeof o.modPath !== 'string') return false
  if (o.category === 'preview' && !isSafeRelativePath(o.path as string)) return false
  return true
}

export function toPreviewTexture(payload: Omit<TexturePreviewPayload, 'modPath'>): Texture {
  return {
    ...payload,
    replacement: payload.replacement
      ? { ...payload.replacement, previewUrl: payload.replacement.previewUrl ?? '' }
      : undefined,
    previewUrl: '',
    isDecoded: true,
  }
}
