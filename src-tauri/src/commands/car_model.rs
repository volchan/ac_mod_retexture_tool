use std::io::Cursor;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose;
use base64::Engine;

use crate::converters::uv_template;
use crate::errors::AppError;
use crate::parsers::kn5_mesh::{read_geometry, UvMesh};

/// The meshes of a car that wear one texture, flattened into the buffers a
/// WebGL renderer draws from directly.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CarMesh {
    /// Base64 of raw little-endian f32 triples, in car space.
    pub positions: String,
    /// Base64 of raw little-endian f32 pairs.
    pub uvs: String,
    /// Base64 of raw little-endian u32, already offset per mesh.
    pub indices: String,
    pub vertex_count: u32,
    pub triangle_count: u32,
    /// Where each original mesh landed in `indices`, so the viewer can name the
    /// part under the cursor.
    pub parts: Vec<MeshRange>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshRange {
    pub name: String,
    /// First triangle of the part, counted in triangles rather than indices.
    pub start: u32,
    pub count: u32,
}

/// Renders the UV island outlines of `texture_name` as a PNG data URL, so the
/// editor can lay the car's panel seams over the texture being painted.
#[tauri::command]
pub async fn get_uv_template(
    car_path: String,
    texture_name: String,
    width: u32,
    height: u32,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        render_template(&car_path, &texture_name, width, height)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Ships the geometry wearing `texture_name`, so the editor can show the car
/// itself next to the flat texture being painted.
#[tauri::command]
pub async fn get_car_mesh(car_path: String, texture_name: String) -> Result<CarMesh, String> {
    tauri::async_runtime::spawn_blocking(move || read_car_mesh(&car_path, &texture_name))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

fn render_template(
    car_path: &str,
    texture_name: &str,
    width: u32,
    height: u32,
) -> Result<String, AppError> {
    let kn5 = main_kn5(Path::new(car_path))?;
    let geometry = read_geometry(&kn5)?;
    let meshes = geometry.meshes_using(texture_name);
    if meshes.is_empty() {
        return Err(AppError::NotFound(format!(
            "no mesh in {} uses {texture_name}",
            kn5.file_name().unwrap_or_default().to_string_lossy()
        )));
    }

    let image = uv_template::render(&meshes, width, height);
    let mut png: Vec<u8> = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
        .map_err(|e| AppError::Kn5Parse(e.to_string()))?;
    Ok(format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(&png)
    ))
}

fn read_car_mesh(car_path: &str, texture_name: &str) -> Result<CarMesh, AppError> {
    let kn5 = main_kn5(Path::new(car_path))?;
    let geometry = read_geometry(&kn5)?;
    let meshes = geometry.meshes_using(texture_name);
    if meshes.is_empty() {
        return Err(AppError::NotFound(format!("no mesh uses {texture_name}")));
    }
    Ok(pack(&meshes))
}

/// Every mesh becomes one range of a single buffer, so the viewer draws the
/// whole panel set in one call; indices shift by the vertices already written.
pub fn pack(meshes: &[&UvMesh]) -> CarMesh {
    let mut positions: Vec<u8> = Vec::new();
    let mut uvs: Vec<u8> = Vec::new();
    let mut indices: Vec<u8> = Vec::new();
    let mut parts: Vec<MeshRange> = Vec::new();
    let mut written: u32 = 0;
    let mut triangles: u32 = 0;

    for mesh in meshes {
        for point in &mesh.positions {
            for axis in point {
                positions.extend_from_slice(&axis.to_le_bytes());
            }
        }
        for uv in &mesh.uvs {
            // KN5 points V up, the way a GPU samples a texture bottom-up.
            uvs.extend_from_slice(&uv[0].to_le_bytes());
            uvs.extend_from_slice(&(1.0 + uv[1]).to_le_bytes());
        }
        for index in &mesh.indices {
            indices.extend_from_slice(&(written + u32::from(*index)).to_le_bytes());
        }
        written += mesh.positions.len() as u32;
        let count = (mesh.indices.len() / 3) as u32;
        parts.push(MeshRange {
            name: mesh.name.clone(),
            start: triangles,
            count,
        });
        triangles += count;
    }

    CarMesh {
        vertex_count: written,
        triangle_count: triangles,
        parts,
        positions: general_purpose::STANDARD.encode(&positions),
        uvs: general_purpose::STANDARD.encode(&uvs),
        indices: general_purpose::STANDARD.encode(&indices),
    }
}

/// A car folder holds the detailed model next to its LODs and its collision
/// hull; only the first carries the full UV layout, and it is always the
/// largest of the three.
pub fn main_kn5(car_path: &Path) -> Result<PathBuf, AppError> {
    let entries = std::fs::read_dir(car_path)?;
    let mut candidates: Vec<(u64, PathBuf)> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("kn5")))
        .filter(|p| !is_secondary_model(p))
        .filter_map(|p| Some((p.metadata().ok()?.len(), p)))
        .collect();

    candidates.sort_by_key(|(size, _)| *size);
    candidates
        .pop()
        .map(|(_, path)| path)
        .ok_or_else(|| AppError::NotFound(format!("no car model in {}", car_path.display())))
}

fn is_secondary_model(path: &Path) -> bool {
    let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
        return true;
    };
    let lower = name.to_ascii_lowercase();
    lower == "collider" || lower.contains("_lod")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mesh(name: &str, positions: &[[f32; 3]], uvs: &[[f32; 2]], indices: &[u16]) -> UvMesh {
        UvMesh {
            name: name.to_string(),
            material_id: 0,
            uvs: uvs.to_vec(),
            positions: positions.to_vec(),
            indices: indices.to_vec(),
        }
    }

    fn triangle(name: &str) -> UvMesh {
        mesh(
            name,
            &[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
            &[[0.0, 0.0], [1.0, 0.0], [0.0, -1.0]],
            &[0, 1, 2],
        )
    }

    fn floats(encoded: &str) -> Vec<f32> {
        general_purpose::STANDARD
            .decode(encoded)
            .unwrap()
            .as_chunks::<4>()
            .0
            .iter()
            .map(|word| f32::from_le_bytes(*word))
            .collect()
    }

    fn u32s(encoded: &str) -> Vec<u32> {
        general_purpose::STANDARD
            .decode(encoded)
            .unwrap()
            .as_chunks::<4>()
            .0
            .iter()
            .map(|word| u32::from_le_bytes(*word))
            .collect()
    }

    fn write_kn5(dir: &Path, name: &str, bytes: usize) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, vec![0u8; bytes]).unwrap();
        path
    }

    /// Both meshes go into one buffer, so the second one's indices have to move
    /// past the first one's vertices or it draws over the first panel.
    #[test]
    fn a_second_mesh_indexes_past_the_vertices_already_written() {
        let packed = pack(&[&triangle("BODY"), &triangle("DOOR")]);

        assert_eq!(u32s(&packed.indices), vec![0, 1, 2, 3, 4, 5]);
        assert_eq!(packed.vertex_count, 6);
        assert_eq!(packed.triangle_count, 2);
    }

    /// KN5 points V up and a GPU samples bottom-up, so the flip is an offset
    /// rather than a negation — `uv_template::to_pixel` reads the same V against
    /// a row index instead.
    #[test]
    fn v_is_offset_by_one_while_u_is_left_alone() {
        let packed = pack(&[&triangle("BODY")]);

        assert_eq!(floats(&packed.uvs), vec![0.0, 1.0, 1.0, 1.0, 0.0, 0.0]);
    }

    #[test]
    fn positions_are_written_in_car_space_untouched() {
        let packed = pack(&[&triangle("BODY")]);

        assert_eq!(
            floats(&packed.positions),
            vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
        );
    }

    /// The viewer names the part under the cursor from these, and counts them in
    /// triangles rather than indices.
    #[test]
    fn each_mesh_keeps_its_own_range_of_the_buffer() {
        let two = mesh("GLASS", &[[0.0; 3]; 4], &[[0.0; 2]; 4], &[0, 1, 2, 0, 2, 3]);
        let packed = pack(&[&triangle("BODY"), &two]);

        assert_eq!(packed.parts.len(), 2);
        assert_eq!((packed.parts[0].start, packed.parts[0].count), (0, 1));
        assert_eq!((packed.parts[1].start, packed.parts[1].count), (1, 2));
        assert_eq!(packed.parts[1].name, "GLASS");
    }

    #[test]
    fn packing_nothing_produces_an_empty_buffer_set() {
        let packed = pack(&[]);

        assert_eq!((packed.vertex_count, packed.triangle_count), (0, 0));
        assert!(packed.parts.is_empty());
        assert!(packed.positions.is_empty());
    }

    /// A car folder holds the detailed model beside its LODs and its collision
    /// hull, and only the first carries the full UV layout.
    #[test]
    fn the_largest_model_that_is_not_a_lod_or_a_collider_wins() {
        let dir = tempfile::tempdir().unwrap();
        write_kn5(dir.path(), "collider.kn5", 9_000);
        write_kn5(dir.path(), "car_lod_b.kn5", 8_000);
        let main = write_kn5(dir.path(), "car.kn5", 400);
        write_kn5(dir.path(), "extra.kn5", 200);

        assert_eq!(main_kn5(dir.path()).unwrap(), main);
    }

    #[test]
    fn a_model_is_found_whatever_case_its_extension_carries() {
        let dir = tempfile::tempdir().unwrap();
        let main = write_kn5(dir.path(), "car.KN5", 100);

        assert_eq!(main_kn5(dir.path()).unwrap(), main);
    }

    #[test]
    fn a_folder_holding_no_model_is_an_error_rather_than_a_guess() {
        let dir = tempfile::tempdir().unwrap();
        write_kn5(dir.path(), "ui_car.json", 100);

        assert!(main_kn5(dir.path()).is_err());
    }

    #[test]
    fn a_folder_holding_only_lods_and_a_collider_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        write_kn5(dir.path(), "collider.kn5", 100);
        write_kn5(dir.path(), "car_LOD_B.kn5", 900);

        assert!(main_kn5(dir.path()).is_err());
    }

    #[test]
    fn lods_and_colliders_are_recognised_whatever_case_they_carry() {
        for name in [
            "collider.kn5",
            "COLLIDER.kn5",
            "car_lod_b.kn5",
            "Car_LOD_D.kn5",
        ] {
            assert!(is_secondary_model(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn the_detailed_model_is_not_mistaken_for_a_secondary_one() {
        for name in ["car.kn5", "rss_gtm_lanzo.kn5", "body_loaded.kn5"] {
            assert!(!is_secondary_model(Path::new(name)), "{name}");
        }
    }
}
