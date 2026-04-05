import { invoke } from '@tauri-apps/api/core'
import type { Mod } from '@/types/index'

export async function scanModFolder(path: string): Promise<Mod> {
  return invoke('scan_mod_folder', { path })
}
