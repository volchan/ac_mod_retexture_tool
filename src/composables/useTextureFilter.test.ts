import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { useTextureFilter } from './useTextureFilter'

async function withSetup<T>(composable: () => T): Promise<{ result: T; unmount: () => void }> {
  let result!: T
  const App = defineComponent({
    setup() {
      result = composable()
      return {}
    },
    template: '<div/>',
  })
  const wrapper = mount(App)
  await nextTick()
  return { result, unmount: () => wrapper.unmount() }
}

beforeEach(() => {
  useTextureFilter().reset()
})

describe('useTextureFilter', () => {
  it('defaults to all category', async () => {
    const { result, unmount } = await withSetup(() => useTextureFilter())
    expect(result.activeCategory.value).toBe('all')
    unmount()
  })

  it('defaults to all kn5 group', async () => {
    const { result, unmount } = await withSetup(() => useTextureFilter())
    expect(result.activeKn5Group.value).toBe('all')
    unmount()
  })

  it('defaults to empty search query', async () => {
    const { result, unmount } = await withSetup(() => useTextureFilter())
    expect(result.searchQuery.value).toBe('')
    unmount()
  })

  it('defaults to md density', async () => {
    const { result, unmount } = await withSetup(() => useTextureFilter())
    expect(result.density.value).toBe('md')
    unmount()
  })

  it('setCategory updates activeCategory', async () => {
    const { result, unmount } = await withSetup(() => useTextureFilter())
    result.setCategory('body')
    expect(result.activeCategory.value).toBe('body')
    unmount()
  })

  it('setKn5Group updates activeKn5Group', async () => {
    const { result, unmount } = await withSetup(() => useTextureFilter())
    result.setKn5Group('car.kn5')
    expect(result.activeKn5Group.value).toBe('car.kn5')
    unmount()
  })

  it('setSearch updates searchQuery', async () => {
    const { result, unmount } = await withSetup(() => useTextureFilter())
    result.setSearch('body')
    expect(result.searchQuery.value).toBe('body')
    unmount()
  })

  it('setDensity updates density', async () => {
    const { result, unmount } = await withSetup(() => useTextureFilter())
    result.setDensity('lg')
    expect(result.density.value).toBe('lg')
    unmount()
  })

  it('reset restores all defaults', async () => {
    const { result, unmount } = await withSetup(() => useTextureFilter())
    result.setCategory('interior')
    result.setKn5Group('interior.kn5')
    result.setSearch('wheel')
    result.setDensity('sm')
    result.reset()
    expect(result.activeCategory.value).toBe('all')
    expect(result.activeKn5Group.value).toBe('all')
    expect(result.searchQuery.value).toBe('')
    expect(result.density.value).toBe('md')
    unmount()
  })
})
