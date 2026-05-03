import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LibraryFilterBar from './LibraryFilterBar.vue'

const defaultProps = {
  total: 100,
  shown: 42,
  typeFilter: 'all' as const,
  sourceFilter: 'all' as const,
  query: '',
  sortBy: 'name' as const,
}

describe('LibraryFilterBar', () => {
  it('renders count', () => {
    const wrapper = mount(LibraryFilterBar, { props: defaultProps })
    expect(wrapper.text()).toContain('42 of 100')
  })

  it('emits update:typeFilter when Cars button clicked', async () => {
    const wrapper = mount(LibraryFilterBar, { props: defaultProps })
    const buttons = wrapper.findAll('button')
    const carsBtn = buttons.find((b) => b.text() === 'Cars')
    await carsBtn?.trigger('click')
    expect(wrapper.emitted('update:typeFilter')?.[0]).toEqual(['car'])
  })

  it('emits update:typeFilter when Tracks button clicked', async () => {
    const wrapper = mount(LibraryFilterBar, { props: defaultProps })
    const buttons = wrapper.findAll('button')
    const tracksBtn = buttons.find((b) => b.text() === 'Tracks')
    await tracksBtn?.trigger('click')
    expect(wrapper.emitted('update:typeFilter')?.[0]).toEqual(['track'])
  })

  it('emits update:typeFilter when All type button clicked', async () => {
    const wrapper = mount(LibraryFilterBar, {
      props: { ...defaultProps, typeFilter: 'car' as const },
    })
    const buttons = wrapper.findAll('button')
    const allBtn = buttons.find((b) => b.text() === 'All')
    await allBtn?.trigger('click')
    expect(wrapper.emitted('update:typeFilter')?.[0]).toEqual(['all'])
  })

  it('emits update:sourceFilter when Kunos button clicked', async () => {
    const wrapper = mount(LibraryFilterBar, { props: defaultProps })
    const buttons = wrapper.findAll('button')
    const kunosBtn = buttons.find((b) => b.text() === 'Kunos')
    await kunosBtn?.trigger('click')
    expect(wrapper.emitted('update:sourceFilter')?.[0]).toEqual(['kunos'])
  })

  it('emits update:sourceFilter when Mods button clicked', async () => {
    const wrapper = mount(LibraryFilterBar, { props: defaultProps })
    const buttons = wrapper.findAll('button')
    const modsBtn = buttons.find((b) => b.text() === 'Mods')
    await modsBtn?.trigger('click')
    expect(wrapper.emitted('update:sourceFilter')?.[0]).toEqual(['mods'])
  })

  it('emits update:sourceFilter when All source button clicked', async () => {
    const wrapper = mount(LibraryFilterBar, {
      props: { ...defaultProps, sourceFilter: 'kunos' as const },
    })
    const allBtns = wrapper.findAll('button').filter((b) => b.text() === 'All')
    await allBtns[1]?.trigger('click')
    expect(wrapper.emitted('update:sourceFilter')?.[0]).toEqual(['all'])
  })

  it('emits update:query on input', async () => {
    const wrapper = mount(LibraryFilterBar, { props: defaultProps })
    const input = wrapper.find('input')
    await input.setValue('ferrari')
    expect(wrapper.emitted('update:query')?.[0]).toEqual(['ferrari'])
  })

  it('emits update:sortBy on select change', async () => {
    const wrapper = mount(LibraryFilterBar, { props: defaultProps })
    const select = wrapper.find('select')
    await select.setValue('textures')
    expect(wrapper.emitted('update:sortBy')?.[0]).toEqual(['textures'])
  })
})
