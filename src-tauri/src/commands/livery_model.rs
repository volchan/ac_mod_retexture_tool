use std::collections::HashMap;
use std::path::Path;

use crate::commands::car_model::{main_kn5, pack, CarMesh};
use crate::commands::skin::ensure_safe_folder_name;
use crate::converters::dds;
use crate::errors::AppError;
use crate::parsers::kn5::Kn5File;
use crate::parsers::kn5_mesh::{read_geometry, Kn5Geometry, UvMesh};

/// Samplers worth uploading to a preview: the paint, and the panel creases.
const DIFFUSE_SAMPLERS: &[&str] = &["txDiffuse", "txdiffuse"];
const NORMAL_SAMPLERS: &[&str] = &["txNormal", "txnormal"];

/// A whole car as one draw-ready buffer set: the geometry, the material groups
/// carved out of it, and every texture those groups name.
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveryTexture {
    pub name: String,
    pub data_url: String,
}

/// The car as the game would dress it: skin files over model files, and anything
/// the queue is about to replace over both.
///
/// `overrides` pairs a texture name with the replacement image queued for it.
#[tauri::command]
pub async fn get_livery_model(
    car_path: String,
    skin: String,
    max_texture: u32,
    overrides: Vec<(String, String)>,
) -> Result<LiveryModel, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_livery_model(&car_path, &skin, max_texture, &overrides)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

fn read_livery_model(
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

    let mut library = TextureLibrary::new(car, skin, max_texture, overrides)?;
    let groups = build_groups(&geometry, &meshes, &mesh, &mut library);

    Ok(LiveryModel {
        mesh,
        groups,
        textures: library.into_textures(),
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

/// Decodes each texture once, however many materials name it, and hands back the
/// index the viewer uses to find it again.
struct TextureLibrary<'a> {
    kn5: Kn5File,
    skin_files: HashMap<String, std::path::PathBuf>,
    max_texture: u32,
    overrides: HashMap<String, &'a str>,
    indices: HashMap<String, Option<u32>>,
    textures: Vec<LiveryTexture>,
}

impl<'a> TextureLibrary<'a> {
    fn new(
        car: &Path,
        skin: &str,
        max_texture: u32,
        overrides: &'a [(String, String)],
    ) -> Result<Self, AppError> {
        Ok(Self {
            kn5: Kn5File::open(&main_kn5(car)?)?,
            skin_files: index_skin_files(&car.join("skins").join(skin)),
            max_texture,
            overrides: overrides
                .iter()
                .map(|(name, path)| (name.to_lowercase(), path.as_str()))
                .collect(),
            indices: HashMap::new(),
            textures: Vec::new(),
        })
    }

    fn slots_for(
        &mut self,
        geometry: &Kn5Geometry,
        material_id: u32,
    ) -> (Option<u32>, Option<u32>) {
        let Some(material) = geometry.materials.get(material_id as usize) else {
            return (None, None);
        };
        let named = |samplers: &[&str]| {
            material
                .textures
                .iter()
                .find(|(sampler, _)| samplers.contains(&sampler.as_str()))
                .map(|(_, texture)| texture.clone())
        };

        let diffuse = named(DIFFUSE_SAMPLERS).and_then(|name| self.index_of(&name));
        let normal = named(NORMAL_SAMPLERS).and_then(|name| self.index_of(&name));
        (diffuse, normal)
    }

    /// A texture the car names but nothing can supply is not an error: the group
    /// draws untextured rather than sinking the whole preview.
    fn index_of(&mut self, name: &str) -> Option<u32> {
        if let Some(known) = self.indices.get(name) {
            return *known;
        }
        let index = self.decode(name).map(|data_url| {
            self.textures.push(LiveryTexture {
                name: name.to_string(),
                data_url,
            });
            (self.textures.len() - 1) as u32
        });
        self.indices.insert(name.to_string(), index);
        index
    }

    // ponytail: one texture at a time. Parallelise if a full GT takes too long to open.
    fn decode(&self, name: &str) -> Option<String> {
        let data = match loose_file(name, &self.overrides, &self.skin_files) {
            Some(path) => std::fs::read(path).ok()?,
            None => self.kn5.get_texture_data(name)?.to_vec(),
        };
        dds::generate_thumbnail(&data, self.max_texture).ok()
    }

    fn into_textures(self) -> Vec<LiveryTexture> {
        self.textures
    }
}

/// The file that outranks the model's own copy of `name`, if any: what the queue
/// is about to write first, then what the skin folder already ships.
///
/// Both sides are keyed by lowercase name. A KN5 naming `Body.dds` and a skin
/// shipping `body.dds` are the same texture everywhere but a case-sensitive
/// filesystem, where the skin's repaint would otherwise be skipped in silence.
fn loose_file(
    name: &str,
    overrides: &HashMap<String, &str>,
    skin_files: &HashMap<String, std::path::PathBuf>,
) -> Option<std::path::PathBuf> {
    let key = name.to_lowercase();
    if let Some(queued) = overrides.get(&key) {
        let path = std::path::PathBuf::from(queued);
        if path.is_file() {
            return Some(path);
        }
    }
    skin_files.get(&key).cloned()
}

/// The skin folder's own files, indexed by lowercase name. Built from a listing
/// rather than by joining texture names: a name read out of a KN5 is third-party
/// data, and `../../` in one would otherwise reach outside the skin.
fn index_skin_files(skin_dir: &Path) -> HashMap<String, std::path::PathBuf> {
    let Ok(entries) = std::fs::read_dir(skin_dir) else {
        return HashMap::new();
    };
    entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter_map(|path| {
            let name = path.file_name()?.to_str()?.to_lowercase();
            Some((name, path))
        })
        .collect()
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
    fn a_queued_replacement_outranks_the_skin_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("body.dds"), b"skin").unwrap();
        let queued = dir.path().join("queued.png");
        std::fs::write(&queued, b"queued").unwrap();

        let overrides = HashMap::from([("body.dds".to_string(), queued.to_str().unwrap())]);

        assert_eq!(
            loose_file("body.dds", &overrides, &index_skin_files(dir.path())),
            Some(queued)
        );
    }

    #[test]
    fn the_skin_file_is_used_when_nothing_is_queued() {
        let dir = tempfile::tempdir().unwrap();
        let body = dir.path().join("body.dds");
        std::fs::write(&body, b"skin").unwrap();

        assert_eq!(
            loose_file("body.dds", &HashMap::new(), &index_skin_files(dir.path())),
            Some(body)
        );
    }

    #[test]
    fn a_skin_file_matches_whatever_case_the_model_names_it_in() {
        // Windows and macOS forgive the mismatch; Linux would drop the repaint.
        let dir = tempfile::tempdir().unwrap();
        let body = dir.path().join("Body.DDS");
        std::fs::write(&body, b"skin").unwrap();

        assert_eq!(
            loose_file("body.dds", &HashMap::new(), &index_skin_files(dir.path())),
            Some(body)
        );
    }

    #[test]
    fn a_texture_name_cannot_climb_out_of_the_skin_folder() {
        // Texture names come out of a third-party KN5, so they never reach the
        // filesystem: only a real entry of the listing can match.
        let dir = tempfile::tempdir().unwrap();
        let skin = dir.path().join("01_red");
        std::fs::create_dir_all(&skin).unwrap();
        std::fs::write(dir.path().join("secret.dds"), b"outside").unwrap();

        assert_eq!(
            loose_file("../secret.dds", &HashMap::new(), &index_skin_files(&skin)),
            None
        );
    }

    #[test]
    fn a_texture_only_the_model_carries_falls_through_to_the_kn5() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("gone.png");
        let overrides = HashMap::from([("body.dds".to_string(), missing.to_str().unwrap())]);

        assert_eq!(
            loose_file("body.dds", &overrides, &index_skin_files(dir.path())),
            None
        );
    }

    #[test]
    fn a_skin_name_that_is_a_path_is_refused() {
        let Err(err) = read_livery_model("/cars/gtm", "../../etc", 512, &[]) else {
            panic!("a skin name climbing out of the folder must be refused");
        };
        assert!(matches!(err, AppError::InvalidInput(_)), "got {err:?}");
    }
}
