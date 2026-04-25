<script setup lang="ts">
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FileJsonIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ImageIcon,
  PackageIcon,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { useTextureFilter } from '@/composables/useTextureFilter'
import type { Mod, ModFile, SkinFolder, Texture } from '@/types/index'
import ModTreeNodes from './ModTreeNodes.vue'

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  fileType?: string
  children: TreeNode[]
}

const props = defineProps<{
  mod: Mod
  textures: Texture[]
}>()

const emit = defineEmits<{ close: [] }>()

const { activeKn5Group, setKn5Group } = useTextureFilter()

const kn5sExpanded = ref(true)
const filesExpanded = ref(true)
const openFolders = ref(new Set<string>())

const kn5Groups = computed(() => {
  const map = new Map<string, { count: number; replacements: number }>()
  for (const t of props.textures) {
    if (!t.kn5File) continue
    const entry = map.get(t.kn5File) ?? { count: 0, replacements: 0 }
    entry.count++
    if (t.replacement) entry.replacements++
    map.set(t.kn5File, entry)
  }
  return [...map.entries()]
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
})

const totalTextures = computed(() => props.textures.length)
const totalReplacements = computed(() => props.textures.filter((t) => t.replacement).length)

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function buildTree(modPath: string, files: ModFile[], skinFolders: SkinFolder[]): TreeNode[] {
  const base = normalizePath(modPath)
  const nodeMap = new Map<string, TreeNode>()

  function ensureDir(dirPath: string): TreeNode {
    const existing = nodeMap.get(dirPath)
    if (existing) return existing
    const parentPath = dirPath.substring(0, dirPath.lastIndexOf('/'))
    const name = dirPath.split('/').pop() as string
    const node: TreeNode = { name, path: dirPath, isDir: true, children: [] }
    nodeMap.set(dirPath, node)
    if (parentPath && parentPath !== base) {
      const parent = ensureDir(parentPath)
      if (!parent.children.find((c) => c.path === dirPath)) parent.children.push(node)
    }
    return node
  }

  const roots: TreeNode[] = []

  for (const file of files) {
    const filePath = normalizePath(file.path)
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'))
    const fileNode: TreeNode = {
      name: file.name,
      path: filePath,
      isDir: false,
      fileType: file.fileType,
      children: [],
    }
    if (dirPath === base) {
      roots.push(fileNode)
    } else {
      const parent = ensureDir(dirPath)
      parent.children.push(fileNode)
    }
  }

  for (const [path, node] of nodeMap) {
    const parentPath = path.substring(0, path.lastIndexOf('/'))
    if (parentPath === base && !roots.find((r) => r.path === path)) roots.push(node)
  }

  if (skinFolders.length > 0) {
    const skinsPath = `${base}/skins`
    let skinsNode = nodeMap.get(skinsPath)
    if (!skinsNode) {
      skinsNode = { name: 'skins', path: skinsPath, isDir: true, children: [] }
    }
    for (const skin of skinFolders) {
      const skinPath = normalizePath(skin.path)
      const skinNode: TreeNode = { name: skin.name, path: skinPath, isDir: true, children: [] }
      for (const sf of skin.files) {
        skinNode.children.push({
          name: sf.name,
          path: normalizePath(sf.path),
          isDir: false,
          fileType: sf.fileType,
          children: [],
        })
      }
      skinNode.children.sort((a, b) => a.name.localeCompare(b.name))
      skinsNode.children.push(skinNode)
    }
    skinsNode.children.sort((a, b) => a.name.localeCompare(b.name))
    if (!nodeMap.has(skinsPath)) {
      roots.push(skinsNode)
    }
  }

  function sort(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      const d = Number(b.isDir) - Number(a.isDir)
      if (d !== 0) return d
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) if (n.isDir) sort(n.children)
  }
  sort(roots)
  return roots
}

const tree = computed<TreeNode[]>(() =>
  buildTree(props.mod.path, props.mod.files, props.mod.skinFolders ?? []),
)

function toggleFolder(path: string) {
  const next = new Set(openFolders.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  openFolders.value = next
}

function fileIconFor(fileType?: string) {
  if (fileType === 'dds') return ImageIcon
  if (fileType === 'json') return FileJsonIcon
  if (fileType === 'kn5') return FileTextIcon
  return FileIcon
}

defineExpose({
  ChevronDownIcon,
  ChevronRightIcon,
  PackageIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  ModTreeNodes,
  normalizePath,
  Button,
  kn5Groups,
  totalTextures,
  totalReplacements,
  tree,
  openFolders,
  kn5sExpanded,
  filesExpanded,
  emit,
  activeKn5Group,
  setKn5Group,
  toggleFolder,
  fileIconFor,
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden text-[12.5px]">
    <!-- Mod header -->
    <div class="px-3 py-2.5 border-b shrink-0">
      <div class="font-semibold text-[13px] text-foreground truncate">{{ mod.meta.name }}</div>
      <div class="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">{{ mod.meta.folderName }}/</div>
    </div>

    <div class="flex-1 overflow-auto min-h-0">
      <!-- KN5 Archives section -->
      <div class="px-2 py-2">
        <button
          class="flex items-center gap-1.5 w-full px-1.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          @click="kn5sExpanded = !kn5sExpanded"
        >
          <ChevronDownIcon v-if="kn5sExpanded" :size="10" />
          <ChevronRightIcon v-else :size="10" />
          <span>KN5 Archives · {{ kn5Groups.length }}</span>
        </button>

        <div v-if="kn5sExpanded" class="mt-1 space-y-px">
          <button
            class="flex items-center gap-1.5 w-full px-1.5 py-[5px] rounded-[5px] text-left transition-colors"
            :class="activeKn5Group === 'all' ? 'bg-[var(--accent-muted)] text-[var(--accent-text)]' : 'text-foreground hover:bg-muted'"
            @click="setKn5Group('all')"
          >
            <PackageIcon :size="12" class="shrink-0 text-muted-foreground" />
            <span class="flex-1 text-left text-[12px]">All archives</span>
            <span
              v-if="totalReplacements > 0"
              class="text-[9.5px] font-medium px-1.5 py-px rounded bg-[var(--accent-muted)] text-[var(--accent-text)] border border-[var(--accent-border)]"
            >{{ totalReplacements }}</span>
            <span class="text-[10.5px] font-mono text-muted-foreground min-w-[22px] text-right">{{ totalTextures }}</span>
          </button>

          <button
            v-for="g in kn5Groups"
            :key="g.name"
            class="flex items-center gap-1.5 w-full px-1.5 py-[5px] rounded-[5px] text-left transition-colors"
            :class="activeKn5Group === g.name ? 'bg-[var(--accent-muted)] text-[var(--accent-text)]' : 'text-foreground hover:bg-muted'"
            @click="setKn5Group(g.name)"
          >
            <PackageIcon
              :size="12"
              class="shrink-0"
              :class="g.replacements > 0 ? 'text-primary' : 'text-muted-foreground'"
            />
            <span class="flex-1 text-left font-mono text-[12px] truncate">{{ g.name }}</span>
            <span
              v-if="g.replacements > 0"
              class="text-[9.5px] font-medium px-1.5 py-px rounded bg-[var(--accent-muted)] text-[var(--accent-text)] border border-[var(--accent-border)] shrink-0"
            >{{ g.replacements }}</span>
            <span class="text-[10.5px] font-mono text-muted-foreground min-w-[22px] text-right shrink-0">{{ g.count }}</span>
          </button>
        </div>
      </div>

      <!-- Files section -->
      <div class="px-2 pt-1 border-t">
        <button
          class="flex items-center gap-1.5 w-full px-1.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          @click="filesExpanded = !filesExpanded"
        >
          <ChevronDownIcon v-if="filesExpanded" :size="10" />
          <ChevronRightIcon v-else :size="10" />
          <span>Files</span>
        </button>

        <div v-if="filesExpanded" class="mt-1">
          <template v-for="node in tree" :key="node.path">
            <div
              v-if="!node.isDir"
              class="flex items-center gap-1.5 py-0.5 px-1.5 rounded hover:bg-accent text-xs"
            >
              <component :is="fileIconFor(node.fileType)" :size="13" class="shrink-0 text-muted-foreground" />
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
      </div>
    </div>

    <!-- Close button -->
    <div class="shrink-0 pt-1 border-t">
      <Button variant="ghost" size="sm" class="w-full text-xs" @click="$emit('close')">
        Close mod
      </Button>
    </div>
  </div>
</template>
