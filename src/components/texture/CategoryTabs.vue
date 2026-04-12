<script setup lang="ts">
import { computed } from 'vue'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { TextureCategory } from '@/types/index'

const CATEGORY_LABELS: Record<TextureCategory, string> = {
  all: 'All',
  body: 'Body',
  livery: 'Liveries',
  interior: 'Interior',
  wheels: 'Wheels',
  road: 'Road',
  terrain: 'Terrain',
  buildings: 'Buildings',
  props: 'Props',
  sky: 'Sky',
  other: 'Other',
  preview: 'Preview image',
}

const props = defineProps<{
  categories: TextureCategory[]
  active: TextureCategory
}>()

const emit = defineEmits<{
  change: [category: TextureCategory]
}>()

const categoryItems = computed(() =>
  props.categories.map((cat) => ({ cat, label: CATEGORY_LABELS[cat] })),
)

function handleTabChange(value: string | number) {
  emit('change', value as TextureCategory)
}

defineExpose({ Tabs, TabsList, TabsTrigger, categoryItems, handleTabChange })
</script>

<template>
  <Tabs :model-value="props.active" @update:model-value="handleTabChange">
    <TabsList class="h-8 gap-0.5">
      <TabsTrigger
        v-for="item in categoryItems"
        :key="item.cat"
        :value="item.cat"
        class="text-xs h-7 px-2"
      >
        {{ item.label }}
      </TabsTrigger>
    </TabsList>
  </Tabs>
</template>
