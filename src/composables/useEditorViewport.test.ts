import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useEditorViewport, useViewCentre } from './useEditorViewport'

function setup(texture = { width: 1000, height: 500 }, container = { width: 400, height: 400 }) {
  return useEditorViewport(ref(texture), ref(container))
}

describe('useEditorViewport', () => {
  it('fits the texture inside the container on its tightest axis', () => {
    const { effectiveScale } = setup()
    expect(effectiveScale.value).toBe(0.4)
  })

  it('centres the fitted texture', () => {
    const { stagePosition } = setup()
    expect(stagePosition.value).toEqual({ x: 0, y: 100 })
  })

  it('falls back to a neutral scale when either box is empty', () => {
    const { effectiveScale } = setup({ width: 0, height: 0 })
    expect(effectiveScale.value).toBe(1)
  })

  it('keeps the point under the cursor fixed while zooming', () => {
    const { effectiveScale, stagePosition, zoomAt } = setup()
    const cursor = { x: 200, y: 200 }
    const before = {
      x: (cursor.x - stagePosition.value.x) / effectiveScale.value,
      y: (cursor.y - stagePosition.value.y) / effectiveScale.value,
    }

    zoomAt(cursor, 1)

    const after = {
      x: (cursor.x - stagePosition.value.x) / effectiveScale.value,
      y: (cursor.y - stagePosition.value.y) / effectiveScale.value,
    }
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('zooms out when handed a negative direction', () => {
    const { effectiveScale, zoomAt } = setup()
    zoomAt({ x: 0, y: 0 }, -1)
    expect(effectiveScale.value).toBeLessThan(0.4)
  })

  it('clamps zoom to the supported range', () => {
    const { effectiveScale, zoomAt } = setup()
    for (let i = 0; i < 200; i += 1) zoomAt({ x: 0, y: 0 }, 1)
    expect(effectiveScale.value).toBe(8)

    for (let i = 0; i < 400; i += 1) zoomAt({ x: 0, y: 0 }, -1)
    expect(effectiveScale.value).toBe(0.02)
  })

  it('translates the stage by the panned delta', () => {
    const { stagePosition, panBy } = setup()
    const start = { ...stagePosition.value }
    panBy({ x: 30, y: -10 })
    expect(stagePosition.value).toEqual({ x: start.x + 30, y: start.y - 10 })
  })

  it('returns to the centred fit after a reset', () => {
    const { stagePosition, effectiveScale, zoomAt, panBy, resetView } = setup()
    zoomAt({ x: 10, y: 10 }, 1)
    panBy({ x: 50, y: 50 })
    resetView()
    expect(effectiveScale.value).toBe(0.4)
    expect(stagePosition.value).toEqual({ x: 0, y: 100 })
  })

  describe('viewCentre', () => {
    it('is the middle of the sheet while the whole sheet is in frame', () => {
      setup()

      expect(useViewCentre().value).toEqual({ x: 500, y: 250 })
    })

    /// What the whole thing is for: zoomed into one door of a big sheet, the
    /// middle of the sheet is somewhere off-screen.
    it('follows the window rather than the sheet once panned', () => {
      const { panBy } = setup()

      panBy({ x: -200, y: 0 })

      expect(useViewCentre().value?.x).toBeGreaterThan(500)
    })

    /// Zooming holds the point under the cursor still, so zooming anywhere else
    /// drags the middle of the window towards it.
    it('is pulled towards whatever the zoom is anchored on', () => {
      const { zoomAt } = setup()

      zoomAt({ x: 0, y: 0 }, 1)

      expect(useViewCentre().value?.x).toBeLessThan(500)
    })

    it('holds still when the zoom is anchored on the middle of the window', () => {
      const { zoomAt } = setup()

      zoomAt({ x: 200, y: 200 }, 1)

      expect(useViewCentre().value?.x).toBeCloseTo(500)
    })

    /// Panned far enough that the window sits off the sheet entirely, a layer
    /// dropped at the middle of the window would be invisible.
    it('stays on the sheet however far the view is panned off it', () => {
      const { panBy } = setup()

      panBy({ x: -100_000, y: -100_000 })

      expect(useViewCentre().value).toEqual({ x: 1000, y: 500 })
    })

    /// Before the canvas has laid out there is no view to speak of, and a
    /// caller has to be able to tell that apart from the top-left corner.
    it('has nothing to say before the canvas has a size', () => {
      setup({ width: 1000, height: 500 }, { width: 0, height: 0 })

      expect(useViewCentre().value).toBeNull()
    })
  })
})
