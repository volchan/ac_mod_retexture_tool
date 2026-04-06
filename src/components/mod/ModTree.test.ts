import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { Mod } from '@/types/index'
import ModTree from './ModTree.vue'

const baseMod: Mod = {
  type: 'car',
  path: '/mods/ferrari_488',
  meta: {
    name: 'Ferrari 488',
    folderName: 'ferrari_488',
    author: 'Test',
    version: '1.0',
    description: '',
  },
  files: [],
  kn5Files: ['/mods/ferrari_488/ferrari_488.kn5'],
  skinFolders: [
    {
      name: 'default',
      path: '/mods/ferrari_488/skins/default',
      files: [
        { name: 'livery.dds', path: '/mods/ferrari_488/skins/default/livery.dds', type: 'dds' },
        { name: 'sponsors.dds', path: '/mods/ferrari_488/skins/default/sponsors.dds', type: 'dds' },
      ],
    },
  ],
}

describe('ModTree', () => {
  it('renders the mod name', () => {
    const wrapper = mount(ModTree, { props: { mod: baseMod } })
    expect(wrapper.text()).toContain('Ferrari 488')
  })

  it('renders a ModBadge for the mod type', () => {
    const wrapper = mount(ModTree, { props: { mod: baseMod } })
    expect(wrapper.text()).toContain('Car')
  })

  it('renders kn5 file names', () => {
    const wrapper = mount(ModTree, { props: { mod: baseMod } })
    expect(wrapper.text()).toContain('ferrari_488.kn5')
  })

  it('renders skin folder names', () => {
    const wrapper = mount(ModTree, { props: { mod: baseMod } })
    expect(wrapper.text()).toContain('default')
  })

  it('does not show skin files when folder is collapsed', () => {
    const wrapper = mount(ModTree, { props: { mod: baseMod } })
    expect(wrapper.text()).not.toContain('livery.dds')
  })

  it('shows skin files when folder is expanded', async () => {
    const wrapper = mount(ModTree, { props: { mod: baseMod } })
    const folderButton = wrapper.findAll('button').find((b) => b.text().includes('default'))
    await folderButton?.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('livery.dds')
    expect(wrapper.text()).toContain('sponsors.dds')
  })

  it('collapses skin folder on second click', async () => {
    const wrapper = mount(ModTree, { props: { mod: baseMod } })
    const folderButton = wrapper.findAll('button').find((b) => b.text().includes('default'))
    await folderButton?.trigger('click')
    await nextTick()
    await folderButton?.trigger('click')
    await nextTick()
    expect(wrapper.text()).not.toContain('livery.dds')
  })

  it('emits close event when close button is clicked', async () => {
    const wrapper = mount(ModTree, { props: { mod: baseMod } })
    const closeButton = wrapper.findAll('button').find((b) => b.text().includes('Close mod'))
    await closeButton?.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('renders track badge for track mod', () => {
    const trackMod: Mod = { ...baseMod, type: 'track' }
    const wrapper = mount(ModTree, { props: { mod: trackMod } })
    expect(wrapper.text()).toContain('Track')
  })
})
