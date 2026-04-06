import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StatusBar from './StatusBar.vue'

describe('StatusBar', () => {
  it('shows "No mod loaded" when no modName is provided', () => {
    const wrapper = mount(StatusBar)
    expect(wrapper.text()).toContain('No mod loaded')
  })

  it('shows mod name and texture count when modName is provided', () => {
    const wrapper = mount(StatusBar, {
      props: { modName: 'Ferrari 488', textureCount: 12, selectedCount: 3 },
    })
    expect(wrapper.text()).toContain('Ferrari 488')
    expect(wrapper.text()).toContain('12 textures')
  })

  it('shows selected count when modName is provided', () => {
    const wrapper = mount(StatusBar, {
      props: { modName: 'Ferrari 488', textureCount: 12, selectedCount: 3 },
    })
    expect(wrapper.text()).toContain('3 selected')
  })

  it('does not show selected count when no modName', () => {
    const wrapper = mount(StatusBar)
    expect(wrapper.text()).not.toContain('selected')
  })

  it('shows 0 for texture count when not provided', () => {
    const wrapper = mount(StatusBar, {
      props: { modName: 'TestMod' },
    })
    expect(wrapper.text()).toContain('0 textures')
  })

  it('shows 0 for selected count when not provided', () => {
    const wrapper = mount(StatusBar, {
      props: { modName: 'TestMod' },
    })
    expect(wrapper.text()).toContain('0 selected')
  })
})
