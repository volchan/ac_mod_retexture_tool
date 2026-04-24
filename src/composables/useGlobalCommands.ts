import { ref } from 'vue'

const extractTick = ref(0)
const importPath = ref<string | null>(null)

export function useGlobalCommands() {
  return {
    extractTick,
    importPath,
    triggerExtract: () => {
      extractTick.value++
    },
    triggerImport: (path: string) => {
      importPath.value = path
    },
  }
}
