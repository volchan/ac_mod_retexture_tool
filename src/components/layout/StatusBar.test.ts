import { openUrl } from '@tauri-apps/plugin-opener'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import StatusBar from './StatusBar.vue'

vi.mock('@/composables/useUpdateCheck', () => ({
  useUpdateCheck: vi.fn(() => ({
    updateAvailable: ref(false),
    latestVersion: ref(''),
    currentVersion: ref('1.0.0'),
  })),
}))

import { useUpdateCheck } from '@/composables/useUpdateCheck'

beforeEach(() => {
  vi.mocked(useUpdateCheck).mockReturnValue({
    updateAvailable: ref(false),
    latestVersion: ref(''),
    currentVersion: ref('1.0.0'),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('StatusBar', () => {
  it('shows "No mod loaded" when no modName is provided', () => {
    const wrapper = mount(StatusBar)
    expect(wrapper.text()).toContain('No mod loaded')
  })

  it('shows mod name and texture count when modName is provided', () => {
    const wrapper = mount(StatusBar, {
      props: { modName: 'Ferrari 488', textureCount: 12, selectedCount: 3 },
    })
    expect(wrapper.text()).toContain('Ferrari 488')
    expect(wrapper.text()).toContain('12 textures')
  })

  it('shows selected count when modName is provided', () => {
    const wrapper = mount(StatusBar, {
      props: { modName: 'Ferrari 488', textureCount: 12, selectedCount: 3 },
    })
    expect(wrapper.text()).toContain('3 selected')
  })

  it('does not show selected count when no modName', () => {
    const wrapper = mount(StatusBar)
    expect(wrapper.text()).not.toContain('selected')
  })

  it('shows 0 for texture count when not provided', () => {
    const wrapper = mount(StatusBar, { props: { modName: 'TestMod' } })
    expect(wrapper.text()).toContain('0 textures')
  })

  it('shows 0 for selected count when not provided', () => {
    const wrapper = mount(StatusBar, { props: { modName: 'TestMod' } })
    expect(wrapper.text()).toContain('0 selected')
  })

  it('shows "dev build" when isDev is true', () => {
    const wrapper = mount(StatusBar, { props: { isDev: true } })
    expect(wrapper.text()).toContain('dev build')
  })

  it('does not render update button when isDev is true even when update available', () => {
    vi.mocked(useUpdateCheck).mockReturnValue({
      updateAvailable: ref(true),
      latestVersion: ref('2.0.0'),
      currentVersion: ref('1.0.0'),
    })
    const wrapper = mount(StatusBar, { props: { isDev: true } })
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('renders clickable update badge when isDev is false and update available', () => {
    vi.mocked(useUpdateCheck).mockReturnValue({
      updateAvailable: ref(true),
      latestVersion: ref('2.0.0'),
      currentVersion: ref('1.0.0'),
    })
    const wrapper = mount(StatusBar, { props: { isDev: false } })
    const badge = wrapper.find('button')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('New version available: v2.0.0')
  })

  it('does not render update button when isDev is false and no update available', () => {
    const wrapper = mount(StatusBar, { props: { isDev: false } })
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('calls openExternalUrl with releases URL on badge click', async () => {
    vi.mocked(useUpdateCheck).mockReturnValue({
      updateAvailable: ref(true),
      latestVersion: ref('2.0.0'),
      currentVersion: ref('1.0.0'),
    })
    const wrapper = mount(StatusBar, { props: { isDev: false } })
    await wrapper.find('button').trigger('click')
    expect(openUrl).toHaveBeenCalledWith(
      'https://github.com/volchan/ac_mod_retexture_tool/releases/latest',
    )
  })
})
