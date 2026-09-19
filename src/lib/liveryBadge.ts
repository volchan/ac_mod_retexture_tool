import { isHexColor, parseHexColor } from '@/lib/floodFill'
import { FALLBACK_COLOURS } from '@/lib/liveryColours'

/// Draws the 128x128 `livery.png` AC shows beside a car in the entry list and
/// the pit board: the livery's two dominant colours split on a diagonal, with
/// the race number over them.
///
/// Small on purpose. It is read at a glance at half this size, so it carries a
/// number and two colours rather than a picture of the car.

/// AC reads `livery.png` at a fixed size; anything else is scaled and blurs.
export const BADGE_SIZE = 128

/// Where the diagonal crosses the top and bottom edges, as a fraction of the
/// width. Leaning it rather than splitting corner to corner leaves the number a
/// readable band of each colour.
const SPLIT = { top: 0.72, bottom: 0.28 }

const NUMBER_FONT = 'bold 66px Inter, system-ui, sans-serif'

/// Below this a colour reads as dark and takes light lettering. Sits where the
/// eye puts the boundary rather than at the midpoint, which looks wrong on
/// saturated reds and blues.
const DARK_LUMINANCE = 0.55

export function drawLiveryBadge(
  canvas: HTMLCanvasElement,
  colours: readonly string[],
  raceNumber: string,
): void {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('The badge canvas has no 2D context')

  canvas.width = BADGE_SIZE
  canvas.height = BADGE_SIZE

  const [first, second] = usableColours(colours)
  paintSplit(context, first, second)

  const trimmed = raceNumber.trim()
  if (trimmed) paintNumber(context, trimmed, [first, second])
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// The caller ranks colours by area and may hand over fewer than two, or one
/// the picker never produced. A badge is always drawn: a missing one reads as a
/// broken skin in AC's list.
function usableColours(colours: readonly string[]): [string, string] {
  const usable = colours.filter(isHexColor)
  const first = usable[0] ?? FALLBACK_COLOURS[0]
  return [first, usable[1] ?? first]
}

function paintSplit(context: CanvasRenderingContext2D, first: string, second: string): void {
  context.fillStyle = first
  context.fillRect(0, 0, BADGE_SIZE, BADGE_SIZE)

  context.fillStyle = second
  context.beginPath()
  context.moveTo(SPLIT.top * BADGE_SIZE, 0)
  context.lineTo(BADGE_SIZE, 0)
  context.lineTo(BADGE_SIZE, BADGE_SIZE)
  context.lineTo(SPLIT.bottom * BADGE_SIZE, BADGE_SIZE)
  context.closePath()
  context.fill()
}

/// The number straddles the diagonal, so it is contrasted against both halves
/// at once and outlined in the opposite shade — neither colour alone decides it.
function paintNumber(
  context: CanvasRenderingContext2D,
  raceNumber: string,
  under: readonly [string, string],
): void {
  const lit = under.map(luminance).reduce((total, value) => total + value, 0) / under.length
  const ink = lit < DARK_LUMINANCE ? '#FFFFFF' : '#111111'
  const halo = lit < DARK_LUMINANCE ? '#111111' : '#FFFFFF'

  context.font = NUMBER_FONT
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  const middle = BADGE_SIZE / 2
  context.lineWidth = 6
  context.lineJoin = 'round'
  context.strokeStyle = halo
  context.strokeText(raceNumber, middle, middle, BADGE_SIZE * 0.9)
  context.fillStyle = ink
  context.fillText(raceNumber, middle, middle, BADGE_SIZE * 0.9)
}

/// Rec. 709 relative luminance, the weighting that matches how bright a colour
/// looks rather than how large its channels are.
function luminance(colour: string): number {
  const { r, g, b } = parseHexColor(colour)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}
