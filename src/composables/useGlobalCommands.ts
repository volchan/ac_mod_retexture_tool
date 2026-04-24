import { ref } from 'vue'

const extractTick = ref(0)
const importPath = ref<string | null>(null)
const queueTick = ref(0)

export function useGlobalCommands() {
  return {
    extractTick,
    importPath,
    queueTick,
    triggerExtract: () => {
      extractTick.value++
    },
    triggerImport: (path: string) => {
      importPath.value = path
    },
    triggerQueue: () => {
      queueTick.value++
    },
  }
}
