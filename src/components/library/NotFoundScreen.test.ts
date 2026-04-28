import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NotFoundScreen from './NotFoundScreen.vue'

describe('NotFoundScreen', () => {
  it('shows windows title and try again button when isWindows=true', () => {
    const wrapper = mount(NotFoundScreen, { props: { isWindows: true } })
    expect(wrapper.text()).toContain('Assetto Corsa not found')
    expect(wrapper.text()).toContain('Try again')
  })

  it('shows non-windows title when isWindows=false', () => {
    const wrapper = mount(NotFoundScreen, { props: { isWindows: false } })
    expect(wrapper.text()).toContain('Point to your AC folder')
    expect(wrapper.find('button[class*="hover:bg-muted"]').exists()).toBe(false)
  })

  it('emits browse when browse button clicked', async () => {
    const wrapper = mount(NotFoundScreen, { props: { isWindows: true } })
    await wrapper.findAll('button')[0].trigger('click')
    expect(wrapper.emitted('browse')).toBeTruthy()
  })

  it('emits rescan when try again button clicked', async () => {
    const wrapper = mount(NotFoundScreen, { props: { isWindows: true } })
    const buttons = wrapper.findAll('button')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('rescan')).toBeTruthy()
  })
})
