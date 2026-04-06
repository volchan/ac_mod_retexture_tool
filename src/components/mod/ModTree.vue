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
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import type { Mod, ModFile, SkinFolder } from '@/types/index'
import ModBadge from './ModBadge.vue'
import ModTreeNodes from './ModTreeNodes.vue'

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  fileType?: string
  children: TreeNode[]
}

const props = defineProps<{ mod: Mod }>()
const emit = defineEmits<{ close: [] }>()

const openFolders = ref(new Set<string>())

function handleClose() {
  emit('close')
}

function buildTree(modPath: string, files: ModFile[], skinFolders: SkinFolder[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>()

  function ensureDir(dirPath: string): TreeNode {
    const existing = nodeMap.get(dirPath)
    if (existing) return existing
    const parentPath = dirPath.substring(0, dirPath.lastIndexOf('/'))
    const name = dirPath.split('/').pop() ?? ''
    const node: TreeNode = { name, path: dirPath, isDir: true, children: [] }
    nodeMap.set(dirPath, node)
    if (parentPath && parentPath !== modPath) {
      const parent = ensureDir(parentPath)
      if (!parent.children.find((c) => c.path === dirPath)) parent.children.push(node)
    }
    return node
  }

  const roots: TreeNode[] = []

  for (const file of files) {
    const dirPath = file.path.substring(0, file.path.lastIndexOf('/'))
    const fileNode: TreeNode = {
      name: file.name,
      path: file.path,
      isDir: false,
      fileType: file.fileType,
      children: [],
    }
    if (dirPath === modPath) {
      roots.push(fileNode)
    } else {
      const parent = ensureDir(dirPath)
      parent.children.push(fileNode)
    }
  }

  for (const [path, node] of nodeMap) {
    const parentPath = path.substring(0, path.lastIndexOf('/'))
    if (parentPath === modPath && !roots.find((r) => r.path === path)) {
      roots.push(node)
    }
  }

  if (skinFolders.length > 0) {
    const skinsPath = `${modPath}/skins`
    const skinsNode: TreeNode = { name: 'skins', path: skinsPath, isDir: true, children: [] }
    for (const skin of skinFolders) {
      const skinNode: TreeNode = { name: skin.name, path: skin.path, isDir: true, children: [] }
      for (const sf of skin.files) {
        skinNode.children.push({
          name: sf.name,
          path: sf.path,
          isDir: false,
          fileType: sf.fileType,
          children: [],
        })
      }
      skinNode.children.sort((a, b) => a.name.localeCompare(b.name))
      skinsNode.children.push(skinNode)
    }
    skinsNode.children.sort((a, b) => a.name.localeCompare(b.name))
    roots.push(skinsNode)
  }

  function sort(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) if (n.isDir) sort(n.children)
  }
  sort(roots)

  return roots
}

const tree = computed<TreeNode[]>(() =>
  buildTree(props.mod.path, props.mod.files, props.mod.skinFolders),
)

function toggleFolder(path: string) {
  const next = new Set(openFolders.value)
  if (next.has(path)) {
    next.delete(path)
  } else {
    next.add(path)
  }
  openFolders.value = next
}

defineExpose({
  tree,
  openFolders,
  toggleFolder,
  handleClose,
  ChevronRightIcon,
  FileIcon,
  FileJsonIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ImageIcon,
  Button,
  ModBadge,
  ModTreeNodes,
})
</script>

<template>
  <div class="flex flex-col h-full gap-1 min-h-0">
    <div class="flex items-center gap-2 px-1 py-1 shrink-0">
      <ModBadge :type="props.mod.modType" />
      <span class="text-xs font-medium truncate text-muted-foreground">{{ props.mod.meta.name }}</span>
    </div>

    <div class="flex-1 overflow-auto min-h-0 text-xs">
      <template v-for="node in tree" :key="node.path">
        <div
          v-if="!node.isDir"
          class="flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-accent"
        >
          <component
            :is="node.fileType === 'dds' ? ImageIcon : node.fileType === 'json' ? FileJsonIcon : node.fileType === 'kn5' ? FileTextIcon : FileIcon"
            :size="13"
            class="shrink-0 text-muted-foreground"
          />
          <span class="truncate">{{ node.name }}</span>
        </div>
        <ModTreeNodes
          v-else
          :node="node"
          :depth="0"
          :open-folders="openFolders"
          @toggle="toggleFolder"
        />
      </template>
    </div>

    <div class="shrink-0 pt-1 border-t">
      <Button variant="ghost" size="sm" class="w-full text-xs" @click="handleClose">
        Close mod
      </Button>
    </div>
  </div>
</template>
