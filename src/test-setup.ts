import { vi } from 'vitest'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Node >=22 ships an experimental global `localStorage` that stays undefined
// unless the runtime is given --localstorage-file, and it shadows the jsdom
// one. Installing our own keeps the suite working on any Node version.
installMemoryStorage()

function installMemoryStorage() {
  const storage = createMemoryStorage()
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, 'localStorage', {
      writable: true,
      configurable: true,
      value: storage,
    })
  }
}

function createMemoryStorage(): Storage {
  let entries = new Map<string, string>()

  return {
    get length() {
      return entries.size
    },
    key(index: number) {
      return [...entries.keys()][index] ?? null
    },
    getItem(key: string) {
      return entries.get(key) ?? null
    },
    setItem(key: string, value: string) {
      entries.set(key, String(value))
    },
    removeItem(key: string) {
      entries.delete(key)
    },
    clear() {
      entries = new Map()
    },
  }
}
