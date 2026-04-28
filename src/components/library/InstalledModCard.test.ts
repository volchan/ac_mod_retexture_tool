import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { LibraryEntry } from '@/types/index'
import InstalledModCard from './InstalledModCard.vue'

const CAR_ENTRY: LibraryEntry = {
  id: 'ferrari_488',
  modType: 'car',
  path: '/ac/content/cars/ferrari_488',
  name: 'Ferrari 488 GT3',
  isKunos: false,
  textureCount: 48,
  brand: 'Ferrari',
  bhp: 550,
  year: 2016,
  skinCount: 8,
  author: 'Kunos Simulazioni',
}

const TRACK_ENTRY: LibraryEntry = {
  id: 'monza',
  modType: 'track',
  path: '/ac/content/tracks/monza',
  name: 'Monza',
  isKunos: true,
  textureCount: 200,
  country: 'Italy',
  length: 5793,
  layouts: 3,
}

describe('InstalledModCard', () => {
  it('renders car name and brand', () => {
    const wrapper = mount(InstalledModCard, { props: { entry: CAR_ENTRY } })
    expect(wrapper.text()).toContain('Ferrari 488 GT3')
    expect(wrapper.text()).toContain('Ferrari')
  })

  it('renders car skin count', () => {
    const wrapper = mount(InstalledModCard, { props: { entry: CAR_ENTRY } })
    expect(wrapper.text()).toContain('8 skins')
  })

  it('renders texture count', () => {
    const wrapper = mount(InstalledModCard, { props: { entry: CAR_ENTRY } })
    expect(wrapper.text()).toContain('48')
  })

  it('renders author footer', () => {
    const wrapper = mount(InstalledModCard, { props: { entry: CAR_ENTRY } })
    expect(wrapper.text()).toContain('Kunos Simulazioni')
  })

  it('renders track country and length', () => {
    const wrapper = mount(InstalledModCard, { props: { entry: TRACK_ENTRY } })
    expect(wrapper.text()).toContain('Italy')
    expect(wrapper.text()).toContain('5.79 km')
  })

  it('renders track layouts count', () => {
    const wrapper = mount(InstalledModCard, { props: { entry: TRACK_ENTRY } })
    expect(wrapper.text()).toContain('3 layouts')
  })

  it('renders kunos badge for kunos mod', () => {
    const wrapper = mount(InstalledModCard, { props: { entry: TRACK_ENTRY } })
    expect(wrapper.text()).toContain('Kunos')
  })

  it('renders Mod badge for non-kunos mod', () => {
    const wrapper = mount(InstalledModCard, { props: { entry: CAR_ENTRY } })
    expect(wrapper.text()).toContain('Mod')
  })

  it('emits open when card clicked', async () => {
    const wrapper = mount(InstalledModCard, { props: { entry: CAR_ENTRY } })
    await wrapper.find('div[class*="cursor-pointer"]').trigger('click')
    expect(wrapper.emitted('open')).toBeTruthy()
  })

  it('renders bhp chip', () => {
    const wrapper = mount(InstalledModCard, { props: { entry: CAR_ENTRY } })
    expect(wrapper.text()).toContain('550 bhp')
  })

  it('renders year chip', () => {
    const wrapper = mount(InstalledModCard, { props: { entry: CAR_ENTRY } })
    expect(wrapper.text()).toContain('2016')
  })
})
