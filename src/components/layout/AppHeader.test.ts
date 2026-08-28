import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Mod } from '@/types/index'
import AppHeader from './AppHeader.vue'

function makeMod(overrides: Partial<Mod> = {}): Mod {
  return {
    modType: 'track',
    path: '/mods/spa',
    meta: { name: 'Spa', folderName: 'spa', author: '', version: '', description: '' },
    files: [],
    kn5Files: [],
    skinFolders: [],
    ...overrides,
  }
}

describe('AppHeader', () => {
  it('renders the search bar button', () => {
    const wrapper = mount(AppHeader)
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.text()).toContain('Search or run action')
  })

  it('emits open-cmd when search bar clicked', async () => {
    const wrapper = mount(AppHeader)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('open-cmd')).toBeTruthy()
  })

  it('shows mod type badge and name when mod provided', () => {
    const wrapper = mount(AppHeader, { props: { mod: makeMod() } })
    expect(wrapper.text()).toContain('Track')
    expect(wrapper.text()).toContain('Spa')
    expect(wrapper.text()).toContain('spa')
  })

  it('shows nothing in left section when no mod', () => {
    const wrapper = mount(AppHeader)
    expect(wrapper.text()).not.toContain('Track')
    expect(wrapper.text()).not.toContain('Car')
  })
})
