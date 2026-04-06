import { clearMockStore } from '@tauri-apps/plugin-store'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceLayout from './WorkspaceLayout.vue'

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
  it('renders left slot content', () => {
    const wrapper = mount(WorkspaceLayout, {
      slots: { left: '<div data-testid="left-content">Left</div>' },
    })
    expect(wrapper.find('[data-testid="left-content"]').exists()).toBe(true)
  })

  it('renders center slot content', () => {
    const wrapper = mount(WorkspaceLayout, {
      slots: { center: '<div data-testid="center-content">Center</div>' },
    })
    expect(wrapper.find('[data-testid="center-content"]').exists()).toBe(true)
  })

  it('renders right slot content', () => {
    const wrapper = mount(WorkspaceLayout, {
      slots: { right: '<div data-testid="right-content">Right</div>' },
    })
    expect(wrapper.find('[data-testid="right-content"]').exists()).toBe(true)
  })

  it('passes modName prop to StatusBar — shows mod name', () => {
    const wrapper = mount(WorkspaceLayout, {
      props: { modName: 'Test Mod', textureCount: 5, selectedCount: 2 },
    })
    expect(wrapper.text()).toContain('Test Mod')
    expect(wrapper.text()).toContain('5 textures')
    expect(wrapper.text()).toContain('2 selected')
  })

  it('shows "No mod loaded" in StatusBar when no modName', () => {
    const wrapper = mount(WorkspaceLayout)
    expect(wrapper.text()).toContain('No mod loaded')
  })

  it('renders MOD SOURCE and MOD INFO panel headers', () => {
    const wrapper = mount(WorkspaceLayout)
    expect(wrapper.text()).toContain('MOD SOURCE')
    expect(wrapper.text()).toContain('MOD INFO')
  })
})
