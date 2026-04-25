import { openUrl } from '@tauri-apps/plugin-opener'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import StatusBar from './StatusBar.vue'

const REPO_BASE = 'https://github.com/volchan/ac_mod_retexture_tool/releases'

function makeUpdateMock(latestVersion: string, updateAvailable = true, currentVersion = '1.0.0') {
  const latest = ref(latestVersion)
  return {
    updateAvailable: ref(updateAvailable),
    latestVersion: latest,
    currentVersion: ref(currentVersion),
    releaseUrl: computed(() =>
      /-(beta|alpha|rc|pre)/i.test(latest.value)
        ? `${REPO_BASE}/tag/v${latest.value}`
        : `${REPO_BASE}/latest`,
    ),
  }
}

vi.mock('@/composables/useUpdateCheck', () => ({
  useUpdateCheck: vi.fn(() => makeUpdateMock('', false)),
}))

import { useUpdateCheck } from '@/composables/useUpdateCheck'

beforeEach(() => {
  vi.mocked(useUpdateCheck).mockReturnValue(makeUpdateMock('', false))
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
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
    vi.mocked(useUpdateCheck).mockReturnValue(makeUpdateMock('2.0.0'))
    const wrapper = mount(StatusBar)
    const badge = wrapper.find('button')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('New version available: v2.0.0')
  })

  it('shows current version when no update available', () => {
    vi.mocked(useUpdateCheck).mockReturnValue(makeUpdateMock('', false))
    const wrapper = mount(StatusBar)
    const updateBtn = wrapper.findAll('button').find((b) => b.text().includes('version'))
    expect(updateBtn).toBeUndefined()
    expect(wrapper.text()).toContain('v1.0.0')
  })

  it('links to /releases/latest for stable update', async () => {
    vi.mocked(useUpdateCheck).mockReturnValue(makeUpdateMock('2.0.0'))
    const wrapper = mount(StatusBar)
    const updateBtn = wrapper.findAll('button').find((b) => b.text().includes('New version'))
    expect(updateBtn).toBeDefined()
    if (updateBtn) await updateBtn.trigger('click')
    expect(openUrl).toHaveBeenCalledWith(`${REPO_BASE}/latest`)
  })

  it('links to specific tag for beta update', async () => {
    vi.mocked(useUpdateCheck).mockReturnValue(makeUpdateMock('2.0.0-beta.1'))
    const wrapper = mount(StatusBar)
    const updateBtn = wrapper.findAll('button').find((b) => b.text().includes('New version'))
    expect(updateBtn).toBeDefined()
    if (updateBtn) await updateBtn.trigger('click')
    expect(openUrl).toHaveBeenCalledWith(`${REPO_BASE}/tag/v2.0.0-beta.1`)
  })

  it('renders theme toggle button', () => {
    const wrapper = mount(StatusBar)
    const themeBtn = wrapper
      .findAll('button')
      .find((b) => b.attributes('aria-label')?.startsWith('Theme:'))
    expect(themeBtn).toBeDefined()
  })
})
