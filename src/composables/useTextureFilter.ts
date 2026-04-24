import { ref } from 'vue'
import type { TextureCategory, TextureDensity } from '@/types/index'

const activeCategory = ref<TextureCategory>('all')
const activeKn5Group = ref<string>('all')
const searchQuery = ref<string>('')
const density = ref<TextureDensity>('md')

export function useTextureFilter() {
  function setCategory(cat: TextureCategory) {
    activeCategory.value = cat
  }

  function setKn5Group(kn5: string) {
    activeKn5Group.value = kn5
  }

  function setSearch(q: string) {
    searchQuery.value = q
  }

  function setDensity(d: TextureDensity) {
    density.value = d
  }

  function reset() {
    activeCategory.value = 'all'
    activeKn5Group.value = 'all'
    searchQuery.value = ''
    density.value = 'md'
  }

  return {
    activeCategory,
    activeKn5Group,
    searchQuery,
    density,
    setCategory,
    setKn5Group,
    setSearch,
    setDensity,
    reset,
  }
}
