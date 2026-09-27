//! The finish a livery is printed with, as opposed to its colour.
//!
//! A car's `txMaps` holds per-pixel gloss and reflection, and a skin author who
//! ran their decals through it leaves every sponsor there as a change of shine.
//! Painting over the colour sheet hides the sponsor's colour and nothing else:
//! in game the old lettering still catches the light through the new paint.
//! So what the editor covers on the colour sheet is covered here too, with the
//! finish the panel around it already had.

use std::collections::{HashMap, VecDeque};
use std::io::Cursor;
use std::path::Path;

use base64::engine::general_purpose;
use base64::Engine;
use image::{DynamicImage, RgbaImage};
use tauri::AppHandle;

use crate::commands::car_model::main_kn5;
use crate::commands::livery_edit::{decode_sheet, edits_dir, sanitize};
use crate::commands::livery_textures::DIFFUSE_SAMPLER;
use crate::commands::skin_art::{texture_bytes, TextureBytes};
use crate::converters::dds::decode_to_image;
use crate::errors::AppError;
use crate::parsers::kn5_mesh::{read_geometry, Kn5Geometry};

const MAPS_SAMPLER: &str = "txMaps";

/// Suffix of a finish this module wrote, so the webview can tell its own output
/// from a maps texture the user imported and must not be cleaned from scratch.
const CLEANED_SUFFIX: &str = ".clean.png";

/// How wide the tile's copy of the cleaned finish is.
const THUMBNAIL_SIZE: u32 = 256;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanedMaps {
    pub source_path: String,
    pub preview_url: String,
}

/// The finish textures the car's model pairs with this colour sheet.
#[tauri::command]
pub async fn livery_maps(car_path: String, diffuse: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let geometry = read_geometry(&main_kn5(Path::new(&car_path))?)?;
        Ok::<Vec<String>, AppError>(maps_paired_with(&geometry, &diffuse))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Writes a copy of `maps` with the old finish gone from under `coverage`, and
/// returns where it landed. `coverage` is the editor's layers alone, flattened
/// at the maps' own size: opaque where the new paint hides the sheet.
#[tauri::command]
pub async fn clean_livery_maps(
    app: AppHandle,
    maps: TextureBytes,
    maps_key: String,
    coverage: String,
) -> Result<CleanedMaps, String> {
    let dir = edits_dir(&app).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = dir.join(format!("{}{CLEANED_SUFFIX}", sanitize(&maps_key)));
        clean_into(&maps, &coverage, &path)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

fn maps_paired_with(geometry: &Kn5Geometry, diffuse: &str) -> Vec<String> {
    let sampler = |textures: &[(String, String)], wanted: &str| {
        textures
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(wanted))
            .map(|(_, texture)| texture.clone())
    };

    let mut names: Vec<String> = geometry
        .materials
        .iter()
        .filter(|material| {
            sampler(&material.textures, DIFFUSE_SAMPLER)
                .is_some_and(|name| name.eq_ignore_ascii_case(diffuse))
        })
        .filter_map(|material| sampler(&material.textures, MAPS_SAMPLER))
        .collect();
    names.sort();
    names.dedup();
    names
}

fn clean_into(maps: &TextureBytes, coverage: &str, path: &Path) -> Result<CleanedMaps, AppError> {
    let mut finish = decode_to_image(&texture_bytes(maps)?)?.to_rgba8();
    let cover = image::load_from_memory(&decode_sheet(coverage)?)
        .map_err(|e| AppError::ImageDecode(e.to_string()))?
        .to_rgba8();

    // A coverage of another size would clean a region that is not the one the
    // user painted over — a maps texture only shares the sheet's layout at its size.
    if finish.dimensions() != cover.dimensions() {
        return Err(AppError::InvalidInput(format!(
            "coverage is {:?} but the maps texture is {:?}",
            cover.dimensions(),
            finish.dimensions()
        )));
    }

    clean(&mut finish, &cover);

    std::fs::create_dir_all(path.parent().unwrap_or(Path::new(".")))?;
    let image = DynamicImage::ImageRgba8(finish);
    image
        .save_with_format(path, image::ImageFormat::Png)
        .map_err(|e| AppError::ImageEncode(e.to_string()))?;

    Ok(CleanedMaps {
        source_path: path.to_string_lossy().to_string(),
        preview_url: thumbnail_url(&image)?,
    })
}

/// Each separate patch of cover takes the finish most of the panel under it
/// already wears, blended in as far as the cover is opaque.
///
/// ponytail: the prevailing finish is read from under the patch itself, so a
/// cover cut tight around a sticker larger than its own background inherits the
/// sticker's shine. Sample a ring around the patch instead if that shows up.
fn clean(finish: &mut RgbaImage, cover: &RgbaImage) {
    for patch in patches(cover) {
        let Some(prevailing) = prevailing_finish(finish, &patch) else {
            continue;
        };

        for &(x, y) in &patch {
            let weight = f32::from(cover.get_pixel(x, y)[3]) / 255.0;
            let pixel = finish.get_pixel_mut(x, y);
            for channel in 0..4 {
                let old = f32::from(pixel[channel]);
                let new = f32::from(prevailing[channel]);
                pixel[channel] = (old + (new - old) * weight).round() as u8;
            }
        }
    }
}

/// The 4-connected patches of anything the cover is not fully transparent on.
fn patches(cover: &RgbaImage) -> Vec<Vec<(u32, u32)>> {
    let (width, height) = cover.dimensions();
    let mut seen = vec![false; (width as usize) * (height as usize)];
    let index = |x: u32, y: u32| (y as usize) * (width as usize) + x as usize;
    let mut found = Vec::new();

    for (x, y, pixel) in cover.enumerate_pixels() {
        if pixel[3] == 0 || seen[index(x, y)] {
            continue;
        }

        let mut patch = Vec::new();
        let mut queue = VecDeque::from([(x, y)]);
        seen[index(x, y)] = true;
        while let Some((px, py)) = queue.pop_front() {
            patch.push((px, py));
            for (nx, ny) in neighbours(px, py, width, height) {
                if !seen[index(nx, ny)] && cover.get_pixel(nx, ny)[3] > 0 {
                    seen[index(nx, ny)] = true;
                    queue.push_back((nx, ny));
                }
            }
        }
        found.push(patch);
    }
    found
}

fn neighbours(x: u32, y: u32, width: u32, height: u32) -> impl Iterator<Item = (u32, u32)> {
    [
        x.checked_sub(1).map(|nx| (nx, y)),
        (x + 1 < width).then_some((x + 1, y)),
        y.checked_sub(1).map(|ny| (x, ny)),
        (y + 1 < height).then_some((x, y + 1)),
    ]
    .into_iter()
    .flatten()
}

/// Bit shift that groups finishes a compression artefact apart into one.
const FINISH_BUCKET_SHIFT: u8 = 4;

/// The finish most of the patch wears, averaged over the pixels close enough
/// to it to count as the same. Pixels outside the model's islands are fully
/// transparent in a maps texture and say nothing about any panel.
fn prevailing_finish(finish: &RgbaImage, patch: &[(u32, u32)]) -> Option<[u8; 4]> {
    let mut buckets: HashMap<[u8; 4], ([u64; 4], u64)> = HashMap::new();
    for &(x, y) in patch {
        let pixel = finish.get_pixel(x, y).0;
        if pixel[3] == 0 {
            continue;
        }

        let key = pixel.map(|channel| channel >> FINISH_BUCKET_SHIFT);
        let (sum, count) = buckets.entry(key).or_default();
        for channel in 0..4 {
            sum[channel] += u64::from(pixel[channel]);
        }
        *count += 1;
    }

    let (sum, count) = buckets.into_values().max_by_key(|(_, count)| *count)?;
    Some(sum.map(|total| (total / count) as u8))
}

fn thumbnail_url(image: &DynamicImage) -> Result<String, AppError> {
    let mut png = Vec::new();
    image
        .thumbnail(THUMBNAIL_SIZE, THUMBNAIL_SIZE)
        .write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
        .map_err(|e| AppError::ImageEncode(e.to_string()))?;
    Ok(format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(png)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parsers::kn5_mesh::Material;
    use image::Rgba;

    const PANEL: Rgba<u8> = Rgba([33, 67, 167, 143]);
    const LETTER: Rgba<u8> = Rgba([117, 221, 54, 248]);
    const HOLE: Rgba<u8> = Rgba([0, 0, 0, 0]);
    const OPAQUE: Rgba<u8> = Rgba([255, 0, 0, 255]);

    fn material(textures: &[(&str, &str)]) -> Material {
        Material {
            name: "paint".to_string(),
            textures: textures
                .iter()
                .map(|(sampler, name)| (sampler.to_string(), name.to_string()))
                .collect(),
        }
    }

    fn geometry(materials: Vec<Material>) -> Kn5Geometry {
        Kn5Geometry {
            materials,
            meshes: Vec::new(),
        }
    }

    /// A panel with a two-pixel "letter" in the middle of it.
    fn wing() -> RgbaImage {
        let mut finish = RgbaImage::from_pixel(6, 4, PANEL);
        finish.put_pixel(2, 1, LETTER);
        finish.put_pixel(3, 1, LETTER);
        finish
    }

    #[test]
    fn the_maps_worn_beside_the_sheet_are_the_ones_paired_with_it() {
        let car = geometry(vec![
            material(&[("txDiffuse", "Chassis.png"), ("txMaps", "Chassis_AO.png")]),
            material(&[("TXDIFFUSE", "chassis.PNG"), ("txMaps", "Gen_Map.dds")]),
            material(&[("txDiffuse", "glass.dds"), ("txMaps", "glass_maps.dds")]),
            material(&[("txDiffuse", "Chassis.png")]),
        ]);

        assert_eq!(
            maps_paired_with(&car, "Chassis.png"),
            vec!["Chassis_AO.png", "Gen_Map.dds"]
        );
    }

    #[test]
    fn the_letters_under_a_cover_take_the_panels_finish() {
        let mut finish = wing();
        let mut cover = RgbaImage::from_pixel(6, 4, HOLE);
        for x in 1..5 {
            for y in 0..3 {
                cover.put_pixel(x, y, OPAQUE);
            }
        }

        clean(&mut finish, &cover);

        assert!(finish.pixels().all(|pixel| *pixel == PANEL));
    }

    #[test]
    fn what_nothing_covers_is_left_as_it_was() {
        let mut finish = wing();
        let cover = RgbaImage::from_pixel(6, 4, HOLE);

        clean(&mut finish, &cover);

        assert_eq!(finish, wing());
    }

    /// An anti-aliased edge half covers its pixel, and a hard step there would
    /// print the cover's outline into the shine instead of the old letter.
    #[test]
    fn a_half_covered_pixel_moves_half_way() {
        let mut finish = RgbaImage::from_pixel(3, 1, PANEL);
        finish.put_pixel(2, 0, LETTER);
        let mut cover = RgbaImage::from_pixel(3, 1, OPAQUE);
        cover.put_pixel(2, 0, Rgba([255, 0, 0, 128]));

        clean(&mut finish, &cover);

        let blended = finish.get_pixel(2, 0);
        assert!(
            blended[0] > PANEL[0] && blended[0] < LETTER[0],
            "{blended:?}"
        );
    }

    /// Two stickers far apart sit on two panels, and one of them may be
    /// carbon while the other is paint.
    #[test]
    fn each_patch_takes_the_finish_under_it_rather_than_one_for_all() {
        let carbon = Rgba([10, 10, 10, 255]);
        let mut finish = RgbaImage::from_pixel(5, 1, PANEL);
        finish.put_pixel(3, 0, carbon);
        finish.put_pixel(4, 0, carbon);
        let mut cover = RgbaImage::from_pixel(5, 1, OPAQUE);
        cover.put_pixel(2, 0, HOLE);

        clean(&mut finish, &cover);

        assert_eq!(*finish.get_pixel(0, 0), PANEL);
        assert_eq!(*finish.get_pixel(4, 0), carbon);
    }

    #[test]
    fn a_patch_over_nothing_but_holes_is_left_alone() {
        let mut finish = RgbaImage::from_pixel(2, 2, HOLE);
        let cover = RgbaImage::from_pixel(2, 2, OPAQUE);

        clean(&mut finish, &cover);

        assert!(finish.pixels().all(|pixel| *pixel == HOLE));
    }

    #[test]
    fn a_coverage_of_another_size_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let maps_path = dir.path().join("maps.png");
        wing().save(&maps_path).unwrap();
        let mut cover = Vec::new();
        DynamicImage::ImageRgba8(RgbaImage::from_pixel(3, 2, OPAQUE))
            .write_to(&mut Cursor::new(&mut cover), image::ImageFormat::Png)
            .unwrap();

        let result = clean_into(
            &TextureBytes::File {
                path: maps_path.display().to_string(),
            },
            &general_purpose::STANDARD.encode(cover),
            &dir.path().join("out.clean.png"),
        );

        assert!(result.is_err());
    }

    #[test]
    fn the_cleaned_finish_lands_where_it_was_asked_to() {
        let dir = tempfile::tempdir().unwrap();
        let maps_path = dir.path().join("maps.png");
        wing().save(&maps_path).unwrap();
        let mut cover = Vec::new();
        DynamicImage::ImageRgba8(RgbaImage::from_pixel(6, 4, OPAQUE))
            .write_to(&mut Cursor::new(&mut cover), image::ImageFormat::Png)
            .unwrap();
        let out = dir.path().join("edits").join("maps.clean.png");

        let cleaned = clean_into(
            &TextureBytes::File {
                path: maps_path.display().to_string(),
            },
            &format!(
                "data:image/png;base64,{}",
                general_purpose::STANDARD.encode(cover)
            ),
            &out,
        )
        .unwrap();

        assert_eq!(cleaned.source_path, out.display().to_string());
        assert!(cleaned.preview_url.starts_with("data:image/png;base64,"));
        let written = image::open(&out).unwrap().to_rgba8();
        assert!(written.pixels().all(|pixel| *pixel == PANEL));
    }
}
