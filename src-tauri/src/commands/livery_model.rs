use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use tauri::http::Response;
use tauri::{AppHandle, Manager};

use crate::commands::car_model::{main_kn5, pack, CarMesh};
use crate::commands::skin::ensure_safe_folder_name;
use crate::converters::dds;
use crate::errors::AppError;
use crate::parsers::kn5::Kn5File;
use crate::parsers::kn5_mesh::{read_geometry, Kn5Geometry, UvMesh};

/// Samplers worth uploading to a preview: the paint, and the panel creases.
const DIFFUSE_SAMPLERS: &[&str] = &["txDiffuse", "txdiffuse"];
const NORMAL_SAMPLERS: &[&str] = &["txNormal", "txnormal"];

pub const LIVERY_SCHEME: &str = "livery";

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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveryTexture {
    pub name: String,
    pub url: String,
}

/// What the `livery://` handler needs to answer with pixels, set aside by the
/// command that built the model the webview is now loading.
#[derive(Default)]
pub struct LiveryTextureState(pub Mutex<Option<LiveryTextures>>);

pub struct LiveryTextures {
    generation: u64,
    max_texture: u32,
    kn5: Arc<Kn5File>,
    sources: Vec<TextureSource>,
}

enum TextureSource {
    Loose(PathBuf),
    Embedded(String),
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

/// Answers one `livery://localhost/<generation>/<index>` request with a PNG.
///
/// Decoding here rather than in the command spreads forty textures over the
/// webview's own parallel fetches, and keeps not one of them in memory after the
/// response is written.
pub fn serve_texture(state: &LiveryTextureState, path: &str) -> Response<Vec<u8>> {
    match read_texture(state, path) {
        Some(png) => Response::builder()
            .header("Content-Type", "image/png")
            .header("Cache-Control", "no-cache")
            .body(png)
            .unwrap_or_else(|_| not_found()),
        None => not_found(),
    }
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

/// Where each texture will come from, resolved once however many materials name
/// it, and the index the viewer uses to ask for it again.
struct TextureLibrary {
    kn5: Arc<Kn5File>,
    skin_files: HashMap<String, PathBuf>,
    overrides: HashMap<String, String>,
    indices: HashMap<String, Option<u32>>,
    names: Vec<String>,
    sources: Vec<TextureSource>,
}

impl TextureLibrary {
    fn new(
        model: &Path,
        car: &Path,
        skin: &str,
        overrides: &[(String, String)],
    ) -> Result<Self, AppError> {
        Ok(Self {
            kn5: Arc::new(Kn5File::open(model)?),
            skin_files: index_skin_files(&car.join("skins").join(skin)),
            overrides: overrides
                .iter()
                .map(|(name, path)| (name.to_lowercase(), path.clone()))
                .collect(),
            indices: HashMap::new(),
            names: Vec::new(),
            sources: Vec::new(),
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
        let index = self.locate(name).map(|source| {
            self.names.push(name.to_string());
            self.sources.push(source);
            (self.sources.len() - 1) as u32
        });
        self.indices.insert(name.to_string(), index);
        index
    }

    fn locate(&self, name: &str) -> Option<TextureSource> {
        if let Some(path) = loose_file(name, &self.overrides, &self.skin_files) {
            return Some(TextureSource::Loose(path));
        }
        self.kn5
            .get_texture_data(name)
            .map(|_| TextureSource::Embedded(name.to_string()))
    }

    /// Hands the resolved sources to the `livery://` handler and returns the URLs
    /// that reach them. The generation stamped into each one retires the previous
    /// car's addresses, so a late fetch draws nothing rather than the wrong paint.
    fn publish(
        self,
        state: &LiveryTextureState,
        max_texture: u32,
    ) -> Result<Vec<LiveryTexture>, AppError> {
        let mut held = state
            .0
            .lock()
            .map_err(|e| AppError::InvalidInput(e.to_string()))?;

        let generation = held.as_ref().map_or(0, |live| live.generation) + 1;
        let textures = self
            .names
            .iter()
            .enumerate()
            .map(|(index, name)| LiveryTexture {
                name: name.clone(),
                url: texture_url(generation, index),
            })
            .collect();

        *held = Some(LiveryTextures {
            generation,
            max_texture,
            kn5: self.kn5,
            sources: self.sources,
        });

        Ok(textures)
    }
}

/// Windows and Android serve custom schemes over `http`; everywhere else keeps
/// the scheme itself.
fn texture_url(generation: u64, index: usize) -> String {
    if cfg!(any(windows, target_os = "android")) {
        format!("http://{LIVERY_SCHEME}.localhost/{generation}/{index}")
    } else {
        format!("{LIVERY_SCHEME}://localhost/{generation}/{index}")
    }
}

fn read_texture(state: &LiveryTextureState, path: &str) -> Option<Vec<u8>> {
    let (generation, index) = parse_texture_path(path)?;
    let (kn5, source, max_texture) = {
        let guard = state.0.lock().ok()?;
        let live = guard.as_ref()?;
        if live.generation != generation {
            return None;
        }
        let source = match live.sources.get(index)? {
            TextureSource::Loose(path) => TextureSource::Loose(path.clone()),
            TextureSource::Embedded(name) => TextureSource::Embedded(name.clone()),
        };
        (Arc::clone(&live.kn5), source, live.max_texture)
    };

    let data = match &source {
        TextureSource::Loose(path) => std::fs::read(path).ok()?,
        TextureSource::Embedded(name) => kn5.get_texture_data(name)?.to_vec(),
    };
    dds::thumbnail_png(&data, max_texture).ok()
}

fn parse_texture_path(path: &str) -> Option<(u64, usize)> {
    let (generation, index) = path.trim_matches('/').split_once('/')?;
    Some((generation.parse().ok()?, index.parse().ok()?))
}

fn not_found() -> Response<Vec<u8>> {
    Response::builder()
        .status(404)
        .body(Vec::new())
        .expect("a bodyless 404 always builds")
}

/// The file that outranks the model's own copy of `name`, if any: what the queue
/// is about to write first, then what the skin folder already ships.
///
/// Both sides are keyed by lowercase name. A KN5 naming `Body.dds` and a skin
/// shipping `body.dds` are the same texture everywhere but a case-sensitive
/// filesystem, where the skin's repaint would otherwise be skipped in silence.
fn loose_file(
    name: &str,
    overrides: &HashMap<String, String>,
    skin_files: &HashMap<String, PathBuf>,
) -> Option<PathBuf> {
    let key = name.to_lowercase();
    if let Some(queued) = overrides.get(&key) {
        let path = PathBuf::from(queued);
        if path.is_file() {
            return Some(path);
        }
    }
    skin_files.get(&key).cloned()
}

/// The skin folder's own files, indexed by lowercase name. Built from a listing
/// rather than by joining texture names: a name read out of a KN5 is third-party
/// data, and `../../` in one would otherwise reach outside the skin.
fn index_skin_files(skin_dir: &Path) -> HashMap<String, PathBuf> {
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

        let overrides = HashMap::from([("body.dds".to_string(), queued.display().to_string())]);

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
        let overrides = HashMap::from([("body.dds".to_string(), missing.display().to_string())]);

        assert_eq!(
            loose_file("body.dds", &overrides, &index_skin_files(dir.path())),
            None
        );
    }

    #[test]
    fn a_skin_name_that_is_a_path_is_refused() {
        let state = LiveryTextureState::default();
        let Err(err) = read_livery_model(&state, "/cars/gtm", "../../etc", 512, &[]) else {
            panic!("a skin name climbing out of the folder must be refused");
        };
        assert!(matches!(err, AppError::InvalidInput(_)), "got {err:?}");
    }

    #[test]
    fn a_texture_address_splits_into_a_generation_and_an_index() {
        assert_eq!(parse_texture_path("/3/12"), Some((3, 12)));
    }

    #[test]
    fn an_address_that_is_not_two_numbers_reaches_nothing() {
        for path in ["/", "/3", "/3/body.dds", "/x/1", "/3/1/2/3"] {
            assert_eq!(parse_texture_path(path), None, "{path} must not resolve");
        }
    }

    #[test]
    fn the_previous_cars_addresses_stop_answering() {
        // Reopening on another skin reuses index 0, and a fetch still in flight for
        // the old one would otherwise paint the new car in the old paint.
        let state = LiveryTextureState::default();
        let first = published(&state);
        let second = published(&state);

        assert_ne!(first, second);
        assert_eq!(read_texture(&state, &format!("/{first}/0")), None);
    }

    fn published(state: &LiveryTextureState) -> u64 {
        let library = TextureLibrary {
            kn5: Arc::new(Kn5File::empty()),
            skin_files: HashMap::new(),
            overrides: HashMap::new(),
            indices: HashMap::new(),
            names: vec!["body.dds".to_string()],
            sources: vec![TextureSource::Embedded("body.dds".to_string())],
        };
        library.publish(state, 512).unwrap();
        state.0.lock().unwrap().as_ref().unwrap().generation
    }
}
