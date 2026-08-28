import { ref } from 'vue'
import type { TextureCategory, TextureDensity } from '@/types/index'

const DEFAULT_CATEGORY: TextureCategory = 'all'
const DEFAULT_KN5_GROUP = 'all'
const DEFAULT_SEARCH_QUERY = ''
const DEFAULT_DENSITY: TextureDensity = 'md'

const activeCategory = ref<TextureCategory>(DEFAULT_CATEGORY)
const activeKn5Group = ref<string>(DEFAULT_KN5_GROUP)
const searchQuery = ref<string>(DEFAULT_SEARCH_QUERY)
const density = ref<TextureDensity>(DEFAULT_DENSITY)

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
    activeCategory.value = DEFAULT_CATEGORY
    activeKn5Group.value = DEFAULT_KN5_GROUP
    searchQuery.value = DEFAULT_SEARCH_QUERY
    density.value = DEFAULT_DENSITY
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
