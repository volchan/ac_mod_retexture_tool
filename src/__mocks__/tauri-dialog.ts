import { vi } from 'vitest'

/** Mocked return value — override per test with mockReturnValueOnce. */
export const open = vi.fn(async () => null)
export const save = vi.fn(async () => null)
