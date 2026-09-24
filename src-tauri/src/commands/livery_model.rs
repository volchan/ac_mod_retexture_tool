//! The car the livery preview draws: one buffer set for the whole body, carved
//! into the runs that share a material, plus the address of every texture those
//! runs name. The pixels themselves live in `livery_textures`.

use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::commands::car_model::{main_kn5, pack, CarMesh};
use crate::commands::livery_serving::LiveryTextureState;
use crate::commands::livery_textures::{LiveryTexture, TextureLibrary};
use crate::commands::skin::ensure_safe_folder_name;
use crate::errors::AppError;
use crate::parsers::kn5_mesh::{read_geometry, Kn5Geometry, UvMesh};

/// A whole car as one draw-ready buffer set: the geometry, the material groups
/// carved out of it, and the address of every texture those groups name.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveryModel {
    pub mesh: CarMesh,
    pub groups: Vec<MaterialGroup>,
    pub textures: Vec<LiveryTexture>,
}

/// One run of triangles sharing a material, indexing into `LiveryModel.textures`.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialGroup {
    pub start: u32,
    pub count: u32,
    pub diffuse: Option<u32>,
    pub normal: Option<u32>,
}

/// The car as the game would dress it: skin files over model files, and anything
/// the queue is about to replace over both.
///
/// `overrides` pairs a texture name with the replacement image queued for it.
/// Only geometry crosses the IPC boundary; the textures are left for the webview
/// to fetch over `livery://`, which streams bytes instead of base64 in JSON.
#[tauri::command]
pub async fn get_livery_model(
    app: AppHandle,
    car_path: String,
    skin: String,
    max_texture: u32,
    overrides: Vec<(String, String)>,
) -> Result<LiveryModel, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<LiveryTextureState>();
        read_livery_model(&state, &car_path, &skin, max_texture, &overrides)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}


// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

fn read_livery_model(
    state: &LiveryTextureState,
    car_path: &str,
    skin: &str,
    max_texture: u32,
    overrides: &[(String, String)],
) -> Result<LiveryModel, AppError> {
    ensure_safe_folder_name(skin)?;
    let car = Path::new(car_path);
    let model = main_kn5(car)?;
    let geometry = read_geometry(&model)?;

    // `pack` writes one range per mesh in the order it is handed them, so sorting
    // by material first makes every material a contiguous run of those ranges.
    let mut meshes: Vec<&UvMesh> = geometry.meshes.iter().collect();
    meshes.sort_by_key(|m| m.material_id);
    let mesh = pack(&meshes);

    let mut library = TextureLibrary::new(&model, car, skin, overrides)?;
    let groups = build_groups(&geometry, &meshes, &mesh, &mut library);

    let textures = library.publish(state, max_texture)?;

    Ok(LiveryModel {
        mesh,
        groups,
        textures,
    })
}

fn build_groups(
    geometry: &Kn5Geometry,
    meshes: &[&UvMesh],
    packed: &CarMesh,
    library: &mut TextureLibrary,
) -> Vec<MaterialGroup> {
    material_runs(meshes, packed)
        .into_iter()
        .map(|(material_id, start, count)| {
            let (diffuse, normal) = library.slots_for(geometry, material_id);
            MaterialGroup {
                start,
                count,
                diffuse,
                normal,
            }
        })
        .collect()
}

/// `(material_id, first triangle, triangle count)` for each run of meshes sharing
/// a material. Sorting put them side by side; this merges their ranges back.
fn material_runs(meshes: &[&UvMesh], packed: &CarMesh) -> Vec<(u32, u32, u32)> {
    let mut runs: Vec<(u32, u32, u32)> = Vec::new();

    for (mesh, range) in meshes.iter().zip(&packed.parts) {
        match runs.last_mut() {
            Some(last) if last.0 == mesh.material_id => last.2 += range.count,
            _ => runs.push((mesh.material_id, range.start, range.count)),
        }
    }

    runs
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::car_model::MeshRange;
    fn mesh(material_id: u32) -> UvMesh {
        UvMesh {
            name: format!("mesh_{material_id}"),
            material_id,
            uvs: vec![[0.0, 0.0]; 3],
            positions: vec![[0.0, 0.0, 0.0]; 3],
            indices: vec![0, 1, 2],
        }
    }

    fn packed(ranges: &[(u32, u32)]) -> CarMesh {
        CarMesh {
            positions: String::new(),
            uvs: String::new(),
            indices: String::new(),
            vertex_count: 0,
            triangle_count: ranges.iter().map(|(_, count)| count).sum(),
            parts: ranges
                .iter()
                .map(|(start, count)| MeshRange {
                    name: "part".to_string(),
                    start: *start,
                    count: *count,
                })
                .collect(),
        }
    }

    #[test]
    fn meshes_sharing_a_material_merge_into_one_run() {
        let meshes = [mesh(0), mesh(0), mesh(1)];
        let refs: Vec<&UvMesh> = meshes.iter().collect();

        let runs = material_runs(&refs, &packed(&[(0, 2), (2, 3), (5, 1)]));

        assert_eq!(runs, vec![(0, 0, 5), (1, 5, 1)]);
    }

    #[test]
    fn a_material_reappearing_later_opens_a_second_run() {
        // Sorting keeps materials together, but a caller that skips the sort must
        // still get ranges it can hand to addGroup rather than one wrong span.
        let meshes = [mesh(0), mesh(1), mesh(0)];
        let refs: Vec<&UvMesh> = meshes.iter().collect();

        let runs = material_runs(&refs, &packed(&[(0, 1), (1, 1), (2, 1)]));

        assert_eq!(runs, vec![(0, 0, 1), (1, 1, 1), (0, 2, 1)]);
    }

    #[test]
    fn a_skin_name_that_is_a_path_is_refused() {
        let state = LiveryTextureState::default();
        let Err(err) = read_livery_model(&state, "/cars/gtm", "../../etc", 512, &[]) else {
            panic!("a skin name climbing out of the folder must be refused");
        };
        assert!(matches!(err, AppError::InvalidInput(_)), "got {err:?}");
    }
}
