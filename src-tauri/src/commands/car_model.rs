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
