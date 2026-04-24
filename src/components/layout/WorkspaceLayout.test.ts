import { clearMockStore } from '@tauri-apps/plugin-store'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mod } from '@/types/index'
import WorkspaceLayout from './WorkspaceLayout.vue'

function makeMod(overrides: Partial<Mod> = {}): Mod {
  return {
    modType: 'car',
    path: '/mods/ferrari_458',
    meta: {
      name: 'Ferrari 458',
      folderName: 'ferrari_458',
      author: 'Test',
      version: '1.0',
      description: '',
    },
    files: [],
    kn5Files: ['car.kn5'],
    skinFolders: [],
    ...overrides,
  }
}

const globalStubs = {
  TexturePanel: { template: '<div data-testid="texture-panel" />' },
  Kn5Sidebar: { template: '<div data-testid="kn5-sidebar" />' },
  ModInfoPanel: { template: '<div data-testid="mod-info-panel" />' },
  InlinePreviewRail: { template: '<div data-testid="inline-preview-rail" />' },
  AppHeader: { template: '<div data-testid="app-header" />' },
}

beforeEach(() => {
  clearMockStore()
  vi.restoreAllMocks()
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
})

describe('WorkspaceLayout', () => {
  it('renders with required props without throwing', () => {
    const wrapper = mount(WorkspaceLayout, {
      props: { mod: makeMod(), textures: [], focusedTexture: null },
      global: { stubs: globalStubs },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('renders all 3 layout sections', () => {
    const wrapper = mount(WorkspaceLayout, {
      props: { mod: makeMod(), textures: [], focusedTexture: null },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('[data-testid="kn5-sidebar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="texture-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mod-info-panel"]').exists()).toBe(true)
  })
})
