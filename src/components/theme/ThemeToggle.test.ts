import { clearMockStore } from '@tauri-apps/plugin-store'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ThemeToggle from './ThemeToggle.vue'

async function flushAll() {
  await new Promise((r) => setTimeout(r, 0))
}

beforeEach(() => {
  clearMockStore()
  vi.restoreAllMocks()
  document.documentElement.classList.remove('dark')

  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
})

describe('ThemeToggle', () => {
  it('shows system mode aria-label by default', async () => {
    const wrapper = mount(ThemeToggle)
    await flushAll()
    expect(wrapper.find('button').attributes('aria-label')).toBe('Theme: system')
  })

  it('shows light mode aria-label after one click', async () => {
    const wrapper = mount(ThemeToggle)
    await flushAll()
    await wrapper.find('button').trigger('click')
    await flushAll()
    expect(wrapper.find('button').attributes('aria-label')).toBe('Theme: light')
  })

  it('shows dark mode aria-label after two clicks', async () => {
    const wrapper = mount(ThemeToggle)
    await flushAll()
    const btn = wrapper.find('button')
    await btn.trigger('click')
    await flushAll()
    await btn.trigger('click')
    await flushAll()
    expect(btn.attributes('aria-label')).toBe('Theme: dark')
  })

  it('cleans up media listener on unmount when in system mode', async () => {
    const mql = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql)

    const wrapper = mount(ThemeToggle)
    await flushAll()
    // Default is system mode, so a listener is registered
    expect(mql.addEventListener).toHaveBeenCalled()

    wrapper.unmount()
    expect(mql.removeEventListener).toHaveBeenCalled()
  })

  it('cycles mode on each click: system → light → dark → system', async () => {
    const wrapper = mount(ThemeToggle)
    await flushAll()
    const btn = wrapper.find('button')

    expect(btn.attributes('aria-label')).toBe('Theme: system')

    await btn.trigger('click')
    await flushAll()
    expect(btn.attributes('aria-label')).toBe('Theme: light')

    await btn.trigger('click')
    await flushAll()
    expect(btn.attributes('aria-label')).toBe('Theme: dark')

    await btn.trigger('click')
    await flushAll()
    expect(btn.attributes('aria-label')).toBe('Theme: system')
  })
})
