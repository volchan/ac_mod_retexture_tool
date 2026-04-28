import { load } from '@tauri-apps/plugin-store'

export interface PersistedReplacement {
  textureKey: string
  sourcePath: string
  sourceWidth: number
  sourceHeight: number
}

/** Stable identity for a texture across decode sessions. */
export function textureStableKey(name: string, path: string): string {
  return `${name}|${path}`
}

export interface ModReplacementState {
  importFolder?: string
  replacements: PersistedReplacement[]
}

export async function saveModState(modPath: string, state: ModReplacementState): Promise<void> {
  const store = await load('replacements.json')
  await store.set(modPath, state)
  await store.save()
}

export async function loadModState(modPath: string): Promise<ModReplacementState | null> {
  const store = await load('replacements.json')
  return (await store.get<ModReplacementState>(modPath)) ?? null
}
