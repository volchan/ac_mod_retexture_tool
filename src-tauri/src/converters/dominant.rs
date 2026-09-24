//! The colours a painted texture actually wears.
//!
//! Counted here rather than in the webview because this is where the pixels
//! already are. What crosses the IPC boundary is a 128 pixel thumbnail, and a
//! 7168 wide sheet reduced that far by an averaging filter blends every orange
//! stripe into the black beside it: the livery comes back one muddy tone, and
//! the two colours a badge needs collapse into one.

use image::imageops::FilterType;
use image::DynamicImage;

/// Sampling grid. Dominant colours are flat panels metres across, and 65 000
/// samples settle that as well as 25 million do.
const SAMPLE_SIZE: u32 = 256;

/// Below this a pixel is a hole in the sheet rather than paint. A car texture
/// is mostly transparent — the panels are islands on an empty atlas.
const OPAQUE_ENOUGH: u8 = 128;

/// Channel resolution the counting buckets at. Finer splits one flat panel
/// across neighbouring buckets and ranks a gradient above it.
const LEVELS: u32 = 16;

/// How far apart two colours must be for a two-tone badge to read as two tones.
/// Judged the way an eye separates paint: black and a deep orange sit close in
/// RGB and are obviously two colours on a car.
const APART_LIGHTNESS: f32 = 0.15;
const APART_CHROMA: f32 = 0.12;
const APART_HUE: f32 = 30.0;
const COLOURFUL: f32 = 0.1;

/// The `wanted` most-worn colours, as `#rrggbb`, most-worn first.
///
/// Fewer than asked for when the livery has no more colours far enough apart to
/// be worth naming, and none at all when nothing on the sheet is opaque.
pub fn dominant_colours(image: &DynamicImage, wanted: usize) -> Vec<String> {
    let mut counts = [0u32; (LEVELS * LEVELS * LEVELS) as usize];

    // Nearest, not an averaging filter: averaging is what turned the sheet into
    // one tone in the first place.
    let sampled = image
        .resize_exact(SAMPLE_SIZE, SAMPLE_SIZE, FilterType::Nearest)
        .to_rgba8();

    for pixel in sampled.pixels() {
        if pixel[3] < OPAQUE_ENOUGH {
            continue;
        }
        counts[bucket_of(pixel[0], pixel[1], pixel[2])] += 1;
    }

    let mut ranked: Vec<usize> = (0..counts.len()).filter(|at| counts[*at] > 0).collect();
    ranked.sort_by_key(|at| std::cmp::Reverse(counts[*at]));

    pick_distinct(&ranked, wanted)
        .into_iter()
        .map(hex_of)
        .collect()
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// The most common colour, then the most common one far enough from what is
/// already taken. Two near-identical shades would draw a badge's diagonal as a
/// single flat square, which says nothing about the car.
fn pick_distinct(ranked: &[usize], wanted: usize) -> Vec<usize> {
    let mut picked: Vec<usize> = Vec::new();

    for bucket in ranked {
        if picked.len() >= wanted {
            break;
        }
        if picked.iter().all(|taken| distinct(*taken, *bucket)) {
            picked.push(*bucket);
        }
    }

    picked
}

fn distinct(one: usize, other: usize) -> bool {
    let a = paint_of(one);
    let b = paint_of(other);

    if (a.lightness - b.lightness).abs() > APART_LIGHTNESS {
        return true;
    }
    if (a.chroma - b.chroma).abs() > APART_CHROMA {
        return true;
    }

    let colourful = a.chroma > COLOURFUL && b.chroma > COLOURFUL;
    colourful && hue_gap(a.hue, b.hue) > APART_HUE
}

/// How a colour reads rather than what it is made of: how light it is, how much
/// colour is in it at all, and which colour that is.
struct Paint {
    lightness: f32,
    chroma: f32,
    hue: f32,
}

fn paint_of(bucket: usize) -> Paint {
    let [r, g, b] = channels_of(bucket).map(|value| value as f32 / 255.0);
    let high = r.max(g).max(b);
    let low = r.min(g).min(b);
    let chroma = high - low;

    Paint {
        lightness: (high + low) / 2.0,
        chroma,
        hue: hue_of(r, g, b, high, chroma),
    }
}

fn hue_of(r: f32, g: f32, b: f32, high: f32, chroma: f32) -> f32 {
    if chroma == 0.0 {
        return 0.0;
    }
    let sixth = if high == r {
        (g - b) / chroma
    } else if high == g {
        2.0 + (b - r) / chroma
    } else {
        4.0 + (r - g) / chroma
    };
    (sixth * 60.0 + 360.0) % 360.0
}

/// Hue is a circle: an orange at 355 degrees is ten from one at 5, not 350.
fn hue_gap(one: f32, other: f32) -> f32 {
    let gap = (one - other).abs() % 360.0;
    if gap > 180.0 {
        360.0 - gap
    } else {
        gap
    }
}

fn bucket_of(r: u8, g: u8, b: u8) -> usize {
    let level = |value: u8| (value as u32 * LEVELS / 256).min(LEVELS - 1);
    (level(r) * LEVELS * LEVELS + level(g) * LEVELS + level(b)) as usize
}

/// The middle of the bucket rather than its floor, so a white panel comes back
/// near white instead of a sixteenth darker.
fn channels_of(bucket: usize) -> [u8; 3] {
    let step = 256 / LEVELS;
    let middle = step / 2;
    let at = bucket as u32;

    [
        (at / (LEVELS * LEVELS) * step + middle) as u8,
        (at / LEVELS % LEVELS * step + middle) as u8,
        (at % LEVELS * step + middle) as u8,
    ]
}

fn hex_of(bucket: usize) -> String {
    let [r, g, b] = channels_of(bucket);
    format!("#{r:02x}{g:02x}{b:02x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    const BLACK: Rgba<u8> = Rgba([12, 12, 12, 255]);
    const ORANGE: Rgba<u8> = Rgba([235, 110, 20, 255]);
    const WHITE: Rgba<u8> = Rgba([240, 240, 240, 255]);
    const HOLE: Rgba<u8> = Rgba([0, 0, 0, 0]);

    /// A sheet in vertical bands, `shares` wide in proportion — the shape of a
    /// livery atlas, where a colour is a run of panels rather than a blur.
    fn sheet(shares: &[(Rgba<u8>, u32)]) -> DynamicImage {
        let total: u32 = shares.iter().map(|(_, share)| share).sum();
        let mut image = RgbaImage::new(total, 8);

        let mut x = 0;
        for (colour, share) in shares {
            for _ in 0..*share {
                for y in 0..8 {
                    image.put_pixel(x, y, *colour);
                }
                x += 1;
            }
        }

        DynamicImage::ImageRgba8(image)
    }

    #[test]
    fn the_colour_covering_most_of_the_sheet_comes_first() {
        let colours = dominant_colours(&sheet(&[(ORANGE, 70), (WHITE, 30)]), 2);

        assert_eq!(colours.len(), 2);
        assert!(colours[0].starts_with("#e"), "{colours:?}");
    }

    /// The bug this was written for: an orange and black car whose badge came
    /// out black on black. The two sit close together in RGB.
    fn orange_and_black() -> Vec<String> {
        dominant_colours(&sheet(&[(BLACK, 70), (ORANGE, 30)]), 2)
    }

    #[test]
    fn a_deep_orange_separates_from_the_black_beside_it() {
        let colours = orange_and_black();

        assert_eq!(colours.len(), 2, "{colours:?}");
        assert_ne!(colours[0], colours[1]);
    }

    #[test]
    fn the_minority_colour_is_still_named() {
        assert!(orange_and_black()[1].starts_with("#e"), "{:?}", orange_and_black());
    }

    /// A car atlas is mostly holes — the panels are islands on an empty sheet,
    /// and counting the emptiness would make every badge black.
    #[test]
    fn the_transparent_part_of_the_sheet_is_not_a_colour() {
        let colours = dominant_colours(&sheet(&[(HOLE, 90), (ORANGE, 10)]), 2);

        assert_eq!(colours.len(), 1, "{colours:?}");
        assert!(colours[0].starts_with("#e"));
    }

    #[test]
    fn a_sheet_with_no_paint_on_it_names_nothing() {
        assert!(dominant_colours(&sheet(&[(HOLE, 10)]), 2).is_empty());
    }

    #[test]
    fn two_shades_of_one_flat_colour_stay_one_colour() {
        let dark = Rgba([40, 40, 40, 255]);
        let darker = Rgba([54, 54, 54, 255]);

        assert_eq!(dominant_colours(&sheet(&[(dark, 70), (darker, 30)]), 2).len(), 1);
    }

    #[test]
    fn two_saturated_colours_of_the_same_weight_are_told_apart_by_hue() {
        let blue = Rgba([30, 60, 200, 255]);
        let red = Rgba([200, 30, 30, 255]);

        assert_eq!(dominant_colours(&sheet(&[(red, 60), (blue, 40)]), 2).len(), 2);
    }

    #[test]
    fn a_white_panel_reads_back_as_white_rather_than_grey() {
        let colours = dominant_colours(&sheet(&[(Rgba([255, 255, 255, 255]), 10)]), 1);

        assert_eq!(colours[0], "#f8f8f8");
    }

    #[test]
    fn only_as_many_colours_as_asked_for() {
        let sheet = sheet(&[(BLACK, 40), (ORANGE, 30), (WHITE, 30)]);

        assert_eq!(dominant_colours(&sheet, 1).len(), 1);
        assert_eq!(dominant_colours(&sheet, 3).len(), 3);
    }
}
