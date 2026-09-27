import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { SkinEntry } from '@/types/index'
import SkinPickerDialog from './SkinPickerDialog.vue'

function makeSkin(overrides: Partial<SkinEntry> = {}): SkinEntry {
  return {
    name: 'super_silver',
    displayName: 'Super Silver',
    driverName: null,
    team: null,
    number: null,
    country: null,
    previewUrl: null,
    textureCount: 3,
    ...overrides,
  }
}

// The dialog teleports its content to the body, so the wrapper itself is empty.
function bodyText() {
  return document.body.textContent ?? ''
}

async function open(props: Partial<InstanceType<typeof SkinPickerDialog>['$props']> = {}) {
  const wrapper = mount(SkinPickerDialog, {
    props: {
      open: true,
      carName: 'Ferrari 488',
      skins: [makeSkin()],
      isLoading: false,
      error: '',
      ...props,
    },
    attachTo: document.body,
  })
  await nextTick()
  return wrapper
}

describe('SkinPickerDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('matches a skin on any of the names a skinner would search by', async () => {
    const wrapper = await open({
      skins: [
        makeSkin({ name: 'a', displayName: 'Rosso' }),
        makeSkin({ name: 'b', displayName: null, driverName: 'Villeneuve' }),
        makeSkin({ name: 'c', displayName: null, team: 'Scuderia' }),
        makeSkin({ name: 'd', displayName: null }),
      ],
    })

    wrapper.vm.query = 'villeneuve'
    expect(wrapper.vm.filtered.map((s) => s.name)).toEqual(['b'])

    wrapper.vm.query = 'scuderia'
    expect(wrapper.vm.filtered.map((s) => s.name)).toEqual(['c'])

    wrapper.vm.query = 'rosso'
    expect(wrapper.vm.filtered.map((s) => s.name)).toEqual(['a'])
  })

  it('keeps every skin when nothing has been typed', async () => {
    const wrapper = await open({ skins: [makeSkin({ name: 'a' }), makeSkin({ name: 'b' })] })
    wrapper.vm.query = '   '
    expect(wrapper.vm.filtered).toHaveLength(2)
  })

  it('only confirms once a skin has been picked', async () => {
    const wrapper = await open()
    wrapper.vm.confirm()
    expect(wrapper.emitted('select')).toBeUndefined()

    wrapper.vm.selectedName = 'super_silver'
    await nextTick()
    wrapper.vm.confirm()
    expect(wrapper.emitted('select')?.[0]).toEqual([
      expect.objectContaining({ name: 'super_silver' }),
    ])
  })

  it('opens a skin straight from a double click', async () => {
    const wrapper = await open()
    wrapper.vm.openSkin(makeSkin({ name: 'blue' }))
    expect(wrapper.vm.selectedName).toBe('blue')
    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  /// Reopening the picker on the previous search and selection would offer to
  /// open a skin the user never looked at this time.
  it('forgets the search and the selection when it closes', async () => {
    const wrapper = await open()
    wrapper.vm.query = 'rosso'
    wrapper.vm.selectedName = 'super_silver'

    await wrapper.setProps({ open: false })

    expect(wrapper.vm.query).toBe('')
    expect(wrapper.vm.selectedName).toBeNull()
  })

  it('says which car is being browsed', async () => {
    await open()
    expect(bodyText()).toContain('Ferrari 488')
  })

  it('shows the loading state instead of an empty grid', async () => {
    await open({ isLoading: true, skins: [] })
    expect(bodyText()).toContain('Loading skins…')
  })

  it('shows the failure rather than pretending the car has no skins', async () => {
    await open({ error: 'Folder unreadable', skins: [] })
    expect(bodyText()).toContain('Folder unreadable')
  })

  it('says a search matched nothing', async () => {
    const wrapper = await open()
    wrapper.vm.query = 'nope'
    await nextTick()
    expect(bodyText()).toContain('No skins match')
  })

  it('counts textures in the singular for a one-texture skin', async () => {
    await open({ skins: [makeSkin({ textureCount: 1 })] })
    expect(bodyText()).toContain('1 texture')
    expect(bodyText()).not.toContain('1 textures')
  })

  it('falls back to the folder name when the skin has no display name', async () => {
    await open({ skins: [makeSkin({ name: 'raw_folder', displayName: null })] })
    expect(bodyText()).toContain('raw_folder')
  })
})
