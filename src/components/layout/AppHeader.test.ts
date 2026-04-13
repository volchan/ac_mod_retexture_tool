import { getVersion } from '@tauri-apps/api/app'
import { clearMockStore } from '@tauri-apps/plugin-store'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppHeader from './AppHeader.vue'

beforeEach(() => {
  clearMockStore()
  vi.restoreAllMocks()
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
})

describe('AppHeader', () => {
  it('renders the app title', () => {
    const wrapper = mount(AppHeader)
    expect(wrapper.text()).toContain('AC Mod Retexture Tool')
  })

  it('renders the version from getVersion', async () => {
    vi.mocked(getVersion).mockResolvedValue('1.2.3')
    const wrapper = mount(AppHeader)
    await flushPromises()
    expect(wrapper.text()).toContain('v1.2.3')
  })

  it('renders the theme toggle button', () => {
    const wrapper = mount(AppHeader)
    expect(wrapper.find('button').exists()).toBe(true)
  })
})
