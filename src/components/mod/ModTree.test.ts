import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { Mod } from '@/types/index'
import ModTree from './ModTree.vue'

const baseMod: Mod = {
  modType: 'car',
  path: '/mods/ferrari_488',
  meta: {
    name: 'Ferrari 488',
    folderName: 'ferrari_488',
    author: 'Test',
    version: '1.0',
    description: '',
  },
  files: [
    { name: 'ferrari_488.kn5', path: '/mods/ferrari_488/ferrari_488.kn5', fileType: 'kn5' },
    { name: 'ui_car.json', path: '/mods/ferrari_488/ui/ui_car.json', fileType: 'json' },
  ],
  kn5Files: ['/mods/ferrari_488/ferrari_488.kn5'],
  skinFolders: [
    {
      name: 'default',
      path: '/mods/ferrari_488/skins/default',
      files: [
        { name: 'livery.dds', path: '/mods/ferrari_488/skins/default/livery.dds', fileType: 'dds' },
        {
          name: 'sponsors.dds',
          path: '/mods/ferrari_488/skins/default/sponsors.dds',
          fileType: 'dds',
        },
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

  it('renders skin folder names when skins expanded', async () => {
    const wrapper = mount(ModTree, { props: { mod: baseMod } })
    const skinsButton = wrapper.findAll('button').find((b) => b.text().includes('skins'))
    await skinsButton?.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('default')
  })

  it('does not show skin files when skin folder is collapsed', async () => {
    const wrapper = mount(ModTree, { props: { mod: baseMod } })
    // Expand skins but not default
    const skinsButton = wrapper.findAll('button').find((b) => b.text().includes('skins'))
    await skinsButton?.trigger('click')
    await nextTick()
    expect(wrapper.text()).not.toContain('livery.dds')
  })

  it('shows skin files when folder is expanded', async () => {
    const wrapper = mount(ModTree, { props: { mod: baseMod } })
    // Expand skins, then default
    const skinsButton = wrapper.findAll('button').find((b) => b.text().includes('skins'))
    await skinsButton?.trigger('click')
    await nextTick()
    const folderButton = wrapper.findAll('button').find((b) => b.text().includes('default'))
    await folderButton?.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('livery.dds')
    expect(wrapper.text()).toContain('sponsors.dds')
  })

  it('collapses skin folder on second click', async () => {
    const wrapper = mount(ModTree, { props: { mod: baseMod } })
    const skinsButton = wrapper.findAll('button').find((b) => b.text().includes('skins'))
    await skinsButton?.trigger('click')
    await nextTick()
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
    const trackMod: Mod = { ...baseMod, modType: 'track' }
    const wrapper = mount(ModTree, { props: { mod: trackMod } })
    expect(wrapper.text()).toContain('Track')
  })
})
