import { describe, expect, it } from 'vitest'
import { BADGE_SIZE, drawLiveryBadge, FALLBACK_COLOURS } from './liveryBadge'

/// jsdom has no 2D context, and the badge is a sequence of drawing decisions
/// rather than a bitmap worth comparing — so the calls are recorded instead.
interface Recorded {
  fills: string[]
  strokes: string[]
  text: { value: string; fill: string; stroke: string }[]
}

function badgeOf(colours: string[], raceNumber = '24') {
  const recorded: Recorded = { fills: [], strokes: [], text: [] }
  let fillStyle = ''
  let strokeStyle = ''

  const context = {
    get fillStyle() {
      return fillStyle
    },
    set fillStyle(value: string) {
      fillStyle = value
      recorded.fills.push(value)
    },
    get strokeStyle() {
      return strokeStyle
    },
    set strokeStyle(value: string) {
      strokeStyle = value
      recorded.strokes.push(value)
    },
    font: '',
    textAlign: '',
    textBaseline: '',
    lineWidth: 0,
    lineJoin: '',
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    strokeText: (value: string) => {
      recorded.text.push({ value, fill: fillStyle, stroke: strokeStyle })
    },
    fillText: (value: string) => {
      recorded.text.push({ value, fill: fillStyle, stroke: strokeStyle })
    },
  }

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
  } as unknown as HTMLCanvasElement

  drawLiveryBadge(canvas, colours, raceNumber)
  return { canvas, ...recorded }
}

describe('drawLiveryBadge', () => {
  it('draws at the size AC reads the file at', () => {
    const { canvas } = badgeOf(['#1B4D8F', '#E8E8E8'])

    expect(canvas.width).toBe(BADGE_SIZE)
    expect(canvas.height).toBe(BADGE_SIZE)
  })

  it('paints both dominant colours', () => {
    const { fills } = badgeOf(['#1B4D8F', '#E8E8E8'])

    expect(fills).toContain('#1B4D8F')
    expect(fills).toContain('#E8E8E8')
  })

  it('paints the number it is given', () => {
    const { text } = badgeOf(['#1B4D8F', '#E8E8E8'], '51')

    expect(text.every((drawn) => drawn.value === '51')).toBe(true)
    expect(text).not.toHaveLength(0)
  })

  /// The number straddles the diagonal, so it is contrasted against both halves
  /// at once rather than against whichever one it starts on.
  it('writes light lettering over dark paint', () => {
    const { text } = badgeOf(['#101010', '#202020'])

    expect(text.at(-1)?.fill).toBe('#FFFFFF')
  })

  it('writes dark lettering over light paint', () => {
    const { text } = badgeOf(['#F0F0F0', '#E8E8E8'])

    expect(text.at(-1)?.fill).toBe('#111111')
  })

  it('outlines the number in the opposite shade so it survives either half', () => {
    const { text } = badgeOf(['#101010', '#202020'])

    expect(text[0]?.stroke).toBe('#111111')
  })

  it('leaves the badge plain when the skin carries no number', () => {
    expect(badgeOf(['#1B4D8F', '#E8E8E8'], '   ').text).toHaveLength(0)
  })

  /// A badge with no colours is still drawn: a missing livery.png reads as a
  /// broken skin in AC's entry list.
  it('falls back rather than drawing nothing', () => {
    expect(badgeOf([]).fills).toContain(FALLBACK_COLOURS[0])
  })

  it('ignores a colour the picker could never have produced', () => {
    const { fills } = badgeOf(['not-a-colour', '#1B4D8F'])

    expect(fills).not.toContain('not-a-colour')
    expect(fills).toContain('#1B4D8F')
  })

  it('splits a single colour against itself rather than leaving a gap', () => {
    const { fills } = badgeOf(['#1B4D8F'])

    expect(fills.filter((colour) => colour === '#1B4D8F')).toHaveLength(2)
  })

  it('refuses a canvas it cannot draw on', () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement

    expect(() => drawLiveryBadge(canvas, ['#1B4D8F'], '24')).toThrow('no 2D context')
  })
})
