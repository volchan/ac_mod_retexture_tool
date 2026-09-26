import type { TextureBytes } from '@/lib/tauri'
import type { Texture } from '@/types/index'

/// Which pixels a texture stands for: what the queue is about to write, else
/// what the texture is now — which for most of a car is bytes inside the KN5
/// rather than a file anyone can open.
///
/// The file on disk, never the thumbnail the webview holds: that one is 128
/// pixels wide and has already averaged the livery into one tone.
export function paintedBytes(texture: Texture | null): TextureBytes | null {
  if (!texture) return null

  const queued = texture.replacement?.sourcePath
  if (queued) return { kind: 'file', path: queued }
  return originalBytes(texture)
}

/// The texture as the car ships it, whatever the queue holds for it.
export function originalBytes(texture: Texture): TextureBytes | null {
  // `kn5File` is the scan's own bookkeeping, and for a `kn5`-sourced texture
  // that is a bare filename, not a path: `path` is the kn5 the scan actually
  // opened.
  if (texture.kn5File) return { kind: 'embedded', kn5: texture.path, name: texture.name }
  return texture.path ? { kind: 'file', path: texture.path } : null
}
