import type Konva from 'konva'
import { describe, expect, it, vi } from 'vitest'
import { pickColor, stageToCanvas, thumbnailOf, thumbnailRatio } from './stageExport'

function fakeStage(
  transformer?: { nodes: (v?: unknown[]) => unknown[] },
  guide?: { visible: (v?: boolean) => boolean },
  sampled: number[] = [200, 16, 46, 255],
) {
  const state = { scaleX: 0.25, scaleY: 0.25, x: 40, y: 90 }
  const seen: Record<string, unknown>[] = []
  return {
    seen,
    state,
    stage: {
      scaleX: () => state.scaleX,
      scaleY: () => state.scaleY,
      x: () => state.x,
      y: () => state.y,
      scale: (v: { x: number; y: number }) => {
        state.scaleX = v.x
        state.scaleY = v.y
      },
      position: (v: { x: number; y: number }) => {
        state.x = v.x
        state.y = v.y
      },
      findOne: () => transformer,
      find: (selector: string) => (selector === '.editor-chrome' && guide ? [guide] : []),
      toDataURL: (opts: Record<string, unknown>) => {
        seen.push({ ...opts, scaleX: state.scaleX, x: state.x })
        return 'data:image/png;base64,AAA'
      },
      toCanvas: (opts: Record<string, unknown>) => {
        seen.push({ ...opts, scaleX: state.scaleX })
        return { getContext: () => ({ getImageData: () => ({ data: sampled }) }) }
      },
    },
  }
}

describe('stageToCanvas', () => {
  it('exports the full texture at scale one, whatever the current zoom', () => {
    const { stage, seen } = fakeStage()
    stageToCanvas(stage as unknown as Konva.Stage, 2048, 1024)
    expect(seen[0]).toMatchObject({ x: 0, width: 2048, height: 1024, scaleX: 1, pixelRatio: 1 })
  })

  it('puts the viewport back where the user left it', () => {
    const { stage, state } = fakeStage()
    stageToCanvas(stage as unknown as Konva.Stage, 2048, 1024)
    expect(state).toEqual({ scaleX: 0.25, scaleY: 0.25, x: 40, y: 90 })
  })

  it('restores the viewport even when the export throws', () => {
    const { stage, state } = fakeStage()
    stage.toCanvas = () => {
      throw new Error('canvas tainted')
    }
    expect(() => stageToCanvas(stage as unknown as Konva.Stage, 512, 512)).toThrow('canvas tainted')
    expect(state).toEqual({ scaleX: 0.25, scaleY: 0.25, x: 40, y: 90 })
  })

  it('detaches the selection handles so they stay out of the exported livery', () => {
    const attached = [{ id: 'layer-1' }]
    const nodes = vi.fn((v?: unknown[]) => {
      if (v) return v
      return attached
    })
    const { stage } = fakeStage({ nodes })
    stageToCanvas(stage as unknown as Konva.Stage, 512, 512)
    expect(nodes).toHaveBeenCalledWith([])
    expect(nodes).toHaveBeenLastCalledWith(attached)
  })

  it('hides the UV guide while exporting, then puts it back', () => {
    let visible = true
    const duringExport: boolean[] = []
    const guide = {
      visible: (v?: boolean) => {
        if (v !== undefined) visible = v
        return visible
      },
    }
    const { stage } = fakeStage(undefined, guide)
    stage.toCanvas = () => {
      duringExport.push(visible)
      return { getContext: () => null }
    }

    stageToCanvas(stage as unknown as Konva.Stage, 512, 512)

    expect(duringExport).toEqual([false])
    expect(visible).toBe(true)
  })

  it('honours a requested pixel ratio for thumbnails', () => {
    const { stage, seen } = fakeStage()
    stageToCanvas(stage as unknown as Konva.Stage, 2048, 2048, 0.125)
    expect(seen[0].pixelRatio).toBe(0.125)
  })
})

describe('thumbnailOf', () => {
  /// The sheet is rendered once; the tile's copy is scaled off that render
  /// rather than the stage being flattened a second time.
  it('scales the flattened sheet down without rendering it again', () => {
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,T')
    const sheet = { width: 2048, height: 1024 } as HTMLCanvasElement

    expect(thumbnailOf(sheet, 0.125)).toBe('data:image/png;base64,T')
    expect(drawImage).toHaveBeenCalledWith(sheet, 0, 0, 256, 128)
    vi.restoreAllMocks()
  })

  it('says so when the browser will not draw it', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    expect(() => thumbnailOf({ width: 8, height: 8 } as HTMLCanvasElement, 1)).toThrow(
      'will not draw',
    )
    vi.restoreAllMocks()
  })
})

describe('thumbnailRatio', () => {
  it('shrinks a large texture to the thumbnail width', () => {
    expect(thumbnailRatio(2048)).toBe(0.125)
  })

  it('never enlarges a texture already smaller than the thumbnail', () => {
    expect(thumbnailRatio(64)).toBe(1)
  })

  it('stays neutral for a zero-width texture', () => {
    expect(thumbnailRatio(0)).toBe(1)
  })
})

describe('pickColor', () => {
  it('renders a single pixel at the texture coordinate, not at the current zoom', () => {
    const { stage, seen } = fakeStage()
    pickColor(stage as unknown as Konva.Stage, 12.7, 40.2)
    expect(seen[0]).toMatchObject({ x: 12, y: 40, width: 1, height: 1, scaleX: 1 })
  })

  it('reads the sampled pixel back as a hex colour', () => {
    const { stage } = fakeStage(undefined, undefined, [200, 16, 46, 255])
    expect(pickColor(stage as unknown as Konva.Stage, 0, 0)).toBe('#c8102e')
  })

  it('pads a channel that needs two digits', () => {
    const { stage } = fakeStage(undefined, undefined, [0, 5, 255, 255])
    expect(pickColor(stage as unknown as Konva.Stage, 0, 0)).toBe('#0005ff')
  })

  /// Bare sheet shows through wherever nothing was painted, and sampling it would
  /// silently arm the tools with black.
  it('samples nothing where the livery is transparent', () => {
    const { stage } = fakeStage(undefined, undefined, [0, 0, 0, 0])
    expect(pickColor(stage as unknown as Konva.Stage, 0, 0)).toBeNull()
  })

  it('puts the viewport back after sampling', () => {
    const { stage, state } = fakeStage()
    pickColor(stage as unknown as Konva.Stage, 5, 5)
    expect(state).toEqual({ scaleX: 0.25, scaleY: 0.25, x: 40, y: 90 })
  })
})
