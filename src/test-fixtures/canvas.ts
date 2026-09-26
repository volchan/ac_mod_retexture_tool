import { vi } from 'vitest'

/// jsdom builds a real canvas element but gives it no 2D context and no
/// toDataURL. Anything drawing one needs both stubbed; what was actually drawn
/// is covered where the drawing lives, not where a component happens to mount.

export const STUBBED_DATA_URL = 'data:image/png;base64,QkFER0U='

/** Makes every `document.createElement('canvas')` drawable for this test. */
export function stubCanvas(): void {
  const create = document.createElement.bind(document)

  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const element = create(tag)
    if (tag !== 'canvas') return element

    return drawable(element as HTMLCanvasElement)
  })
}

/** The same, for a canvas a component rendered rather than created. */
export function drawable(canvas: HTMLCanvasElement): HTMLCanvasElement {
  canvas.getContext = (() => fakeContext()) as unknown as HTMLCanvasElement['getContext']
  canvas.toDataURL = () => STUBBED_DATA_URL
  return canvas
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// Every property reads as a no-op function and every assignment is accepted,
/// so a drawing routine runs start to finish without jsdom in the way.
function fakeContext() {
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined),
    set: () => true,
  })
}
