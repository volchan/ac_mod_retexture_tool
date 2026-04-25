import { load, type Store } from '@tauri-apps/plugin-store'
import { ref } from 'vue'
import type { Mod, RecentMod } from '@/types/index'

const STORE_KEY = 'recent-mods'
const MAX_RECENTS = 10

const recentMods = ref<RecentMod[]>([])
let storeInstance: Store | null = null

async function getStore(): Promise<Store> {
  if (!storeInstance) storeInstance = await load('settings.json')
  return storeInstance
}

async function loadFromStore() {
  try {
    const store = await getStore()
    const stored = await store.get<RecentMod[]>(STORE_KEY)
    if (stored) recentMods.value = stored
  } catch (error) {
    console.error('[useLibrary] Failed to load recent mods:', error)
  }
}

async function saveToStore() {
  try {
    const store = await getStore()
    await store.set(STORE_KEY, recentMods.value)
    await store.save()
  } catch (error) {
    console.error('[useLibrary] Failed to save recent mods:', error)
  }
}

export function useLibrary() {
  async function init() {
    await loadFromStore()
  }

  async function addRecent(mod: Mod) {
    const entry: RecentMod = {
      id: mod.meta.folderName,
      modType: mod.modType,
      name: mod.meta.name,
      folderName: mod.meta.folderName,
      path: mod.path,
      lastOpenedAt: Date.now(),
      author: mod.meta.author || undefined,
      trackLength: mod.trackMeta?.length,
      pitboxes: mod.trackMeta?.pitboxes,
      country: mod.trackMeta?.country || undefined,
      carBhp: mod.carMeta?.bhp,
      carBrand: mod.carMeta?.brand || undefined,
    }
    const filtered = recentMods.value.filter((r) => r.id !== entry.id)
    recentMods.value = [entry, ...filtered].slice(0, MAX_RECENTS)
    await saveToStore()
  }

  async function updateTextureCount(id: string, count: number) {
    const entry = recentMods.value.find((r) => r.id === id)
    if (!entry || entry.textureCount === count) return
    entry.textureCount = count
    await saveToStore()
  }

  async function removeRecent(id: string) {
    recentMods.value = recentMods.value.filter((r) => r.id !== id)
    await saveToStore()
  }

  return { recentMods, init, addRecent, updateTextureCount, removeRecent }
}
