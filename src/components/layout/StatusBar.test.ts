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
  it('shows nothing in left section when no modName', () => {
    const wrapper = mount(StatusBar)
    expect(wrapper.text()).not.toContain('textures')
  })

  it('shows mod name and texture count when modName is provided', () => {
    const wrapper = mount(StatusBar, {
      props: { modName: 'Ferrari 488', textureCount: 12 },
    })
    expect(wrapper.text()).toContain('Ferrari 488')
    expect(wrapper.text()).toContain('12 textures')
  })

  it('shows 0 for texture count when not provided', () => {
    const wrapper = mount(StatusBar, { props: { modName: 'TestMod' } })
    expect(wrapper.text()).toContain('0 textures')
  })

  it('shows queue count in accent when > 0', () => {
    const wrapper = mount(StatusBar, {
      props: { modName: 'TestMod', queueCount: 3 },
    })
    expect(wrapper.text()).toContain('3 queued')
  })

  it('hides queue count when 0', () => {
    const wrapper = mount(StatusBar, {
      props: { modName: 'TestMod', queueCount: 0 },
    })
    expect(wrapper.text()).not.toContain('queued')
  })

  it('hides queue count when no modName', () => {
    const wrapper = mount(StatusBar, { props: { queueCount: 3 } })
    expect(wrapper.text()).not.toContain('queued')
  })

  it('renders clickable update badge when update available', () => {
    vi.mocked(useUpdateCheck).mockReturnValue({
      updateAvailable: ref(true),
      latestVersion: ref('2.0.0'),
      currentVersion: ref('1.0.0'),
    })
    const wrapper = mount(StatusBar)
    const badge = wrapper.find('button')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('New version available: v2.0.0')
  })

  it('shows current version when no update available', () => {
    vi.mocked(useUpdateCheck).mockReturnValue({
      updateAvailable: ref(false),
      latestVersion: ref(''),
      currentVersion: ref('1.0.0'),
    })
    const wrapper = mount(StatusBar)
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).toContain('v1.0.0')
  })

  it('calls openExternalUrl with releases URL on badge click', async () => {
    vi.mocked(useUpdateCheck).mockReturnValue({
      updateAvailable: ref(true),
      latestVersion: ref('2.0.0'),
      currentVersion: ref('1.0.0'),
    })
    const wrapper = mount(StatusBar)
    await wrapper.find('button').trigger('click')
    expect(openUrl).toHaveBeenCalledWith(
      'https://github.com/volchan/ac_mod_retexture_tool/releases/latest',
    )
  })
})
