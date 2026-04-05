import { vi } from 'vitest'

const storage = new Map<string, unknown>()

const mockStore = {
  get: vi.fn(async (key: string) => storage.get(key) ?? null),
  set: vi.fn(async (key: string, value: unknown) => {
    storage.set(key, value)
  }),
  delete: vi.fn(async (key: string) => {
    storage.delete(key)
  }),
  save: vi.fn(),
}

export const load = vi.fn(async () => mockStore)

/** Clear stored values between tests. */
export function clearMockStore() {
  storage.clear()
}

/** Access the mock store directly for assertions. */
export { mockStore }
