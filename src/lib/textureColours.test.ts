import { afterEach, describe, expect, it, vi } from 'vitest'
import { sampleColours } from './textureColours'

/// jsdom draws nothing, so the sheet under test is handed straight to
/// getImageData as the pixels the sampler would have read back.
function sheetOf(pixels: [number, number, number, number][]) {
  const data = new Uint8ClampedArray(pixels.flat())

  vi.spyOn(document, 'createElement').mockReturnValue({
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: () => {},
      getImageData: () => ({ data }),
    }),
  } as unknown as HTMLCanvasElement)

  return {} as CanvasImageSource
}

/// `times` copies of one pixel, so a test says what share of the sheet wears a
/// colour rather than listing it out.
function run(colour: [number, number, number, number], times: number) {
  return Array.from({ length: times }, () => colour)
}

const BLUE: [number, number, number, number] = [27, 77, 143, 255]
const WHITE: [number, number, number, number] = [232, 232, 232, 255]
const EMPTY: [number, number, number, number] = [0, 0, 0, 0]

afterEach(() => vi.restoreAllMocks())

describe('sampleColours', () => {
  it('ranks the colour covering most of the sheet first', () => {
    const sheet = sheetOf([...run(BLUE, 80), ...run(WHITE, 20)])

    const [first, second] = sampleColours(sheet)

    expect(first).toMatch(/^#1[0-9a-f]4[0-9a-f]8[0-9a-f]$/)
    expect(second).toMatch(/^#e[0-9a-f]e[0-9a-f]e[0-9a-f]$/)
  })

  /// A car atlas is mostly holes — the panels are islands on an empty sheet,
  /// and counting the emptiness would make every badge transparent-black.
  it('ignores the transparent part of the sheet', () => {
    const sheet = sheetOf([...run(EMPTY, 900), ...run(BLUE, 100)])

    expect(sampleColours(sheet)[0]).toMatch(/^#1[0-9a-f]4/)
  })

  it('finds nothing on a sheet with no paint on it', () => {
    expect(sampleColours(sheetOf(run(EMPTY, 50)))).toEqual([])
  })

  /// Two near-identical shades would draw the badge's diagonal as one flat
  /// square, which says nothing about the car.
  it('passes over a second colour too close to the first to see', () => {
    const almostBlue: [number, number, number, number] = [29, 79, 145, 255]
    const sheet = sheetOf([...run(BLUE, 60), ...run(almostBlue, 30), ...run(WHITE, 10)])

    const [, second] = sampleColours(sheet)

    expect(second).toMatch(/^#e[0-9a-f]e[0-9a-f]e[0-9a-f]$/)
  })

  it('returns one colour for a livery that only wears one', () => {
    expect(sampleColours(sheetOf(run(BLUE, 40)))).toHaveLength(1)
  })

  it('returns as many colours as the caller asks for', () => {
    const sheet = sheetOf([...run(BLUE, 40), ...run(WHITE, 30), ...run([200, 20, 20, 255], 20)])

    expect(sampleColours(sheet, 3)).toHaveLength(3)
  })

  /// The bucket's middle, not its floor: a white panel read back a sixteenth
  /// darker would print a grey badge for a white car.
  it('reads a white panel back as white rather than grey', () => {
    const [white] = sampleColours(sheetOf(run([255, 255, 255, 255], 20)))

    expect(Number.parseInt(white.slice(1, 3), 16)).toBeGreaterThan(240)
  })

  it('gives up rather than guessing when there is no context to draw on', () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      getContext: () => null,
    } as unknown as HTMLCanvasElement)

    expect(sampleColours({} as CanvasImageSource)).toEqual([])
  })
})
