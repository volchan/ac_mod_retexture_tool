import { ref } from 'vue'

const extractTick = ref(0)
const importPath = ref<string | null>(null)
const importTick = ref(0)
const queueTick = ref(0)

export function useGlobalCommands() {
  return {
    extractTick,
    importPath,
    importTick,
    queueTick,
    triggerExtract: () => {
      extractTick.value++
    },
    triggerImport: (path: string) => {
      importPath.value = path
      importTick.value++
    },
    triggerQueue: () => {
      queueTick.value++
    },
  }
}
