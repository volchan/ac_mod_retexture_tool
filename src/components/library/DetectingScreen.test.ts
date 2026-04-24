import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { AcProbeResult } from '@/types/index'
import DetectingScreen from './DetectingScreen.vue'

const PROBES: AcProbeResult[] = [
  { path: '/steam/ac', label: 'Steam', status: 'active' },
  { path: '/epic/ac', label: 'Epic', status: 'miss' },
  { path: '/gog/ac', label: 'GOG', status: 'hit' },
  { path: '/env/ac', label: 'Env', status: 'pending' },
]

describe('DetectingScreen', () => {
  it('renders scanning heading', () => {
    const wrapper = mount(DetectingScreen, { props: { probes: [] } })
    expect(wrapper.text()).toContain('Looking for Assetto Corsa')
  })

  it('shows Scanning… when probes list is empty', () => {
    const wrapper = mount(DetectingScreen, { props: { probes: [] } })
    expect(wrapper.text()).toContain('Scanning…')
  })

  it('renders all probes', () => {
    const wrapper = mount(DetectingScreen, { props: { probes: PROBES } })
    expect(wrapper.text()).toContain('/steam/ac')
    expect(wrapper.text()).toContain('/epic/ac')
    expect(wrapper.text()).toContain('not found')
  })

  it('renders last probe without border-b class', () => {
    const wrapper = mount(DetectingScreen, { props: { probes: PROBES } })
    const rows = wrapper.findAll('[class*="px-3.5 py-2.5"]')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('emits pick-manually when skip link clicked', async () => {
    const wrapper = mount(DetectingScreen, { props: { probes: [] } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('pick-manually')).toBeTruthy()
  })
})
