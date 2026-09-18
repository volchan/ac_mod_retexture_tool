import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useMod } from '@/composables/useMod'
import { useSkinMeta } from '@/composables/useSkinMeta'
import type { SkinEntry } from '@/types/index'
import SkinMetaPanel from './SkinMetaPanel.vue'

function makeSkin(overrides: Partial<SkinEntry> = {}): SkinEntry {
  return {
    name: 'super_silver',
    displayName: 'Super Silver',
    driverName: 'Villeneuve',
    team: 'Scuderia',
    number: '27',
    country: 'CA',
    previewUrl: null,
    textureCount: 3,
    ...overrides,
  }
}

async function panelFor(skin: SkinEntry | null) {
  useMod().activeSkin.value = skin
  const wrapper = mount(SkinMetaPanel)
  await nextTick()
  return wrapper
}

function metaOf(wrapper: Awaited<ReturnType<typeof panelFor>>) {
  const meta = wrapper.vm.meta
  if (!meta) throw new Error('The panel has no skin loaded')
  return meta
}

describe('SkinMetaPanel', () => {
  beforeEach(() => {
    useSkinMeta().reset()
    useMod().activeSkin.value = null
  })

  it('seeds the form from the skin the workspace opened', async () => {
    const wrapper = await panelFor(makeSkin())
    expect(wrapper.vm.meta).toMatchObject({
      folderName: 'super_silver',
      skinName: 'Super Silver',
      driverName: 'Villeneuve',
      team: 'Scuderia',
      number: '27',
      country: 'CA',
    })
  })

  it('renders nothing until a skin is open', async () => {
    const wrapper = await panelFor(null)
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('clears the form when the skin is closed', async () => {
    const wrapper = await panelFor(makeSkin())
    useMod().activeSkin.value = null
    await nextTick()
    expect(wrapper.vm.meta).toBeNull()
  })

  it('says the export updates the opened skin while the folder is unchanged', async () => {
    const wrapper = await panelFor(makeSkin())
    expect(wrapper.text()).toContain('Updates this skin.')
  })

  it('warns that a renamed folder leaves the original untouched', async () => {
    const wrapper = await panelFor(makeSkin())
    metaOf(wrapper).folderName = 'my_fork'
    await nextTick()
    expect(wrapper.text()).toContain('super_silver stays untouched')
  })

  /// A fork shipped as a patch names a folder nobody has, so the files it leaves
  /// out never arrive.
  it('refuses to let a renamed skin ship as a partial export', async () => {
    const wrapper = await panelFor(makeSkin())
    metaOf(wrapper).folderName = 'my_fork'
    wrapper.vm.exportFull = false
    await nextTick()
    expect(wrapper.text()).toContain('nothing to layer onto')
  })

  it('shows the folder name error and disables the export', async () => {
    const wrapper = await panelFor(makeSkin())
    metaOf(wrapper).folderName = 'has spaces'
    await nextTick()

    expect(wrapper.text()).toContain('Use letters, digits, dots, dashes and underscores only.')
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('emits export-skin when the button is pressed', async () => {
    const wrapper = await panelFor(makeSkin())
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('export-skin')).toHaveLength(1)
  })

  it('reports an export in progress instead of accepting a second click', async () => {
    const wrapper = await panelFor(makeSkin())
    wrapper.vm.isExporting = true
    await nextTick()

    expect(wrapper.text()).toContain('Packing…')
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('describes what each export mode actually ships', async () => {
    const wrapper = await panelFor(makeSkin())
    expect(wrapper.text()).toContain('Every file, installs on its own.')

    wrapper.vm.exportFull = false
    await nextTick()
    expect(wrapper.text()).toContain('Only what changed')
  })

  it('leaves the fields blank when the skin declares nothing', async () => {
    const wrapper = await panelFor(
      makeSkin({ displayName: null, driverName: null, team: null, number: null, country: null }),
    )
    expect(wrapper.vm.meta).toMatchObject({
      skinName: '',
      driverName: '',
      team: '',
      number: '',
      country: '',
    })
  })
})
