import { open } from '@tauri-apps/plugin-dialog'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'vue-sonner'
import { clearInvokeHandlers, mockInvokeHandler } from '@/__mocks__/tauri-api'
import App from '@/App.vue'
import { useMod } from '@/composables/useMod'
import { useSkinPicker } from '@/composables/useSkinPicker'
import type { Mod, SkinEntry } from '@/types/index'

vi.mock('vue-sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), loading: vi.fn() },
}))

const carMod: Mod = {
  modType: 'car',
  path: '/mods/abarth',
  meta: {
    name: 'Abarth 500',
    folderName: 'abarth500',
    author: 'Kunos',
    version: '1.0',
    description: '',
  },
  carMeta: { brand: 'Abarth', carClass: 'GT', bhp: 135, weight: 997 },
  files: [],
  kn5Files: ['abarth500.kn5'],
  skinFolders: [{ name: 'red', path: '/mods/abarth/skins/red', files: [] }],
}

const trackMod: Mod = {
  modType: 'track',
  path: '/mods/spa',
  meta: { name: 'Spa', folderName: 'spa', author: 'Kunos', version: '1.0', description: '' },
  trackMeta: { country: 'Belgium', length: 7004, pitboxes: 30 },
  files: [],
  kn5Files: ['track.kn5'],
  skinFolders: [],
}

const skin: SkinEntry = {
  name: 'red',
  path: '/mods/abarth/skins/red',
  displayName: null,
  driverName: null,
  team: null,
  number: null,
  country: null,
  previewUrl: null,
  textureCount: 0,
}

function mountApp() {
  return mount(App, { global: { stubs: { teleport: true } }, shallow: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInvokeHandler('scan_mod_folder', () => carMod)
  mockInvokeHandler('list_car_skins', () => [skin])
  mockInvokeHandler('clear_kn5_cache', () => undefined)
})

afterEach(() => {
  clearInvokeHandlers()
  useMod().closeMod()
  useSkinPicker().close()
})

describe('opening a car mod outside the library', () => {
  it('routes a car mod picked via Browse folder to the skin picker', async () => {
    vi.mocked(open).mockResolvedValueOnce('/mods/abarth')
    const wrapper = mountApp()

    await (wrapper.vm as unknown as { handleBrowse: () => Promise<void> }).handleBrowse()
    await new Promise((r) => setTimeout(r, 0))

    const { isOpen, carName, carPath, skins } = useSkinPicker()
    expect(isOpen.value).toBe(true)
    expect(carName.value).toBe('Abarth 500')
    expect(carPath.value).toBe('/mods/abarth')
    expect(skins.value).toEqual([skin])
    expect(toast.error).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('routes a car mod dropped directly to the skin picker', async () => {
    const wrapper = mountApp()

    await (
      wrapper.vm as unknown as { handleOpenRecent: (p: string) => Promise<void> }
    ).handleOpenRecent('/mods/abarth')
    await new Promise((r) => setTimeout(r, 0))

    const { isOpen, carName } = useSkinPicker()
    expect(isOpen.value).toBe(true)
    expect(carName.value).toBe('Abarth 500')
    expect(toast.error).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not leave a car mod loaded as the active workspace', async () => {
    const wrapper = mountApp()

    await (
      wrapper.vm as unknown as { handleOpenRecent: (p: string) => Promise<void> }
    ).handleOpenRecent('/mods/abarth')

    const { mod } = useMod()
    expect(mod.value).toBeNull()
    wrapper.unmount()
  })

  it('still loads a track directly, bypassing the skin picker', async () => {
    mockInvokeHandler('scan_mod_folder', () => trackMod)
    const wrapper = mountApp()

    await (
      wrapper.vm as unknown as { handleOpenRecent: (p: string) => Promise<void> }
    ).handleOpenRecent('/mods/spa')

    const { mod } = useMod()
    const { isOpen } = useSkinPicker()
    expect(mod.value).toEqual(trackMod)
    expect(isOpen.value).toBe(false)
    wrapper.unmount()
  })
})
