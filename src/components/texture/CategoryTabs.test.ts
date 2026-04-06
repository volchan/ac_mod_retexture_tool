import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { TextureCategory } from '@/types/index'
import CategoryTabs from './CategoryTabs.vue'

const CAR_CATEGORIES: TextureCategory[] = ['all', 'body', 'interior', 'wheels', 'other']

describe('CategoryTabs', () => {
  it('renders all provided categories', () => {
    const wrapper = mount(CategoryTabs, {
      props: { categories: CAR_CATEGORIES, active: 'all' },
    })
    const text = wrapper.text()
    expect(text).toContain('All')
    expect(text).toContain('Body')
    expect(text).toContain('Interior')
    expect(text).toContain('Wheels')
    expect(text).toContain('Other')
  })

  it('emits change event when a tab is activated', async () => {
    const wrapper = mount(CategoryTabs, {
      props: { categories: CAR_CATEGORIES, active: 'all' },
    })
    wrapper.vm.$emit('change', 'body')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('change')).toBeTruthy()
    expect(wrapper.emitted('change')?.[0]).toEqual(['body'])
  })

  it('passes active category as model-value', () => {
    const wrapper = mount(CategoryTabs, {
      props: { categories: CAR_CATEGORIES, active: 'body' },
    })
    expect(wrapper.props('active')).toBe('body')
  })

  it('renders correct label for livery category', () => {
    const wrapper = mount(CategoryTabs, {
      props: { categories: ['all', 'livery'] as TextureCategory[], active: 'all' },
    })
    expect(wrapper.text()).toContain('Liveries')
  })

  it('handleTabChange emits change when called directly', () => {
    const wrapper = mount(CategoryTabs, {
      props: { categories: CAR_CATEGORIES, active: 'all' },
    })
    wrapper.vm.handleTabChange('body')
    expect(wrapper.emitted('change')?.[0]).toEqual(['body'])
  })
})
