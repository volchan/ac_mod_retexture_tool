<script setup lang="ts">
import {
  ChevronRightIcon,
  FileIcon,
  FileJsonIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ImageIcon,
} from 'lucide-vue-next'

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  fileType?: string
  children: TreeNode[]
}

const props = defineProps<{
  node: TreeNode
  depth: number
  openFolders: Set<string>
}>()

const emit = defineEmits<{ toggle: [path: string] }>()

function handleToggle(path: string) {
  emit('toggle', path)
}

function fileIconFor(fileType?: string) {
  if (fileType === 'dds') return ImageIcon
  if (fileType === 'json') return FileJsonIcon
  if (fileType === 'kn5') return FileTextIcon
  return FileIcon
}

defineExpose({
  props,
  handleToggle,
  fileIconFor,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
})
</script>

<template>
  <div>
    <button
      type="button"
      class="flex items-center gap-1.5 py-0.5 rounded hover:bg-accent w-full text-left text-xs"
      :style="{ paddingLeft: `${props.depth * 12 + 4}px` }"
      @click="handleToggle(props.node.path)"
    >
      <ChevronRightIcon
        :size="12"
        class="shrink-0 text-muted-foreground transition-transform"
        :class="props.openFolders.has(props.node.path) ? 'rotate-90' : ''"
      />
      <component
        :is="props.openFolders.has(props.node.path) ? FolderOpenIcon : FolderIcon"
        :size="13"
        class="shrink-0 text-muted-foreground"
      />
      <span class="truncate">{{ props.node.name }}</span>
    </button>

    <template v-if="props.openFolders.has(props.node.path)">
      <template v-for="child in props.node.children" :key="child.path">
        <div
          v-if="!child.isDir"
          class="flex items-center gap-1.5 py-0.5 rounded hover:bg-accent text-xs"
          :style="{ paddingLeft: `${(props.depth + 1) * 12 + 4}px` }"
        >
          <component
            :is="fileIconFor(child.fileType)"
            :size="13"
            class="shrink-0 text-muted-foreground"
          />
          <span class="truncate">{{ child.name }}</span>
        </div>
        <ModTreeNodes
          v-else
          :node="child"
          :depth="props.depth + 1"
          :open-folders="props.openFolders"
          @toggle="handleToggle"
        />
      </template>
    </template>
  </div>
</template>
