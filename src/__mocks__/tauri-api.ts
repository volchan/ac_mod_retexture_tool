import { vi } from 'vitest'

/** Registry of mocked invoke handlers keyed by command name. */
const handlers = new Map<string, (...args: unknown[]) => unknown>()

/**
 * Register a mock handler for a Tauri invoke command.
 * Call in beforeEach to set up per-test responses.
 */
export function mockInvokeHandler(command: string, handler: (...args: unknown[]) => unknown) {
  handlers.set(command, handler)
}

/** Clear all registered handlers — call in afterEach. */
export function clearInvokeHandlers() {
  handlers.clear()
}

/** Mocked Tauri core module. */
export const core = {
  invoke: vi.fn(async (command: string, args?: Record<string, unknown>) => {
    const handler = handlers.get(command)
    if (handler) return handler(args)
    throw new Error(`No mock handler registered for invoke("${command}")`)
  }),
}

export const { invoke } = core

/** Mocked Tauri event module. */
export const event = {
  listen: vi.fn(async (_eventName: string, _handler: (event: unknown) => void) => {
    return () => {}
  }),
  emit: vi.fn(),
}

export const { listen, emit } = event

/** Mocked Tauri app module. */
export const app = {
  getVersion: vi.fn(async () => '0.1.0'),
}

export const { getVersion } = app

/** Mocked Tauri webview window. */
export const webviewWindow = {
  getCurrentWebviewWindow: vi.fn(() => ({
    onDragDropEvent: vi.fn(async () => () => {}),
    show: vi.fn(async () => {}),
  })),
}

export const { getCurrentWebviewWindow } = webviewWindow
