import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ModBadge from './ModBadge.vue'

describe('ModBadge', () => {
  it('renders "Car" for car type', () => {
    const wrapper = mount(ModBadge, { props: { type: 'car' } })
    expect(wrapper.text()).toBe('Car')
  })

  it('renders "Track" for track type', () => {
    const wrapper = mount(ModBadge, { props: { type: 'track' } })
    expect(wrapper.text()).toBe('Track')
  })

  it('applies blue classes for car type', () => {
    const wrapper = mount(ModBadge, { props: { type: 'car' } })
    expect(wrapper.classes()).toContain('bg-blue-100')
    expect(wrapper.classes()).toContain('text-blue-800')
  })

  it('applies teal classes for track type', () => {
    const wrapper = mount(ModBadge, { props: { type: 'track' } })
    expect(wrapper.classes()).toContain('bg-teal-100')
    expect(wrapper.classes()).toContain('text-teal-800')
  })
})
