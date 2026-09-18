//! Where each texture of a livery actually comes from: what the queue is about
//! to write, what the skin folder already ships, and what the model carries
//! itself — resolved once however many materials name it.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::commands::image_source::is_readable_image;
use crate::commands::livery_serving::{
    texture_url, LiveryTextureState, LiveryTextures, TextureSource,
};
use crate::errors::AppError;
use crate::parsers::kn5::Kn5File;
use crate::parsers::kn5_mesh::Kn5Geometry;

/// Samplers worth uploading to a preview: the paint, and the panel creases.
/// Matched case-insensitively — the casing here is only what a KN5 usually
/// writes, not what it has to.
const DIFFUSE_SAMPLER: &str = "txDiffuse";
const NORMAL_SAMPLER: &str = "txNormal";

/// One texture of the car, and the address the webview fetches it at.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveryTexture {
    pub name: String,
    pub url: String,
}

/// Where each texture will come from, resolved once however many materials name
/// it, and the index the viewer uses to ask for it again.
pub struct TextureLibrary {
    kn5: Arc<Kn5File>,
    skin_files: HashMap<String, PathBuf>,
    overrides: HashMap<String, String>,
    indices: HashMap<String, Option<u32>>,
    names: Vec<String>,
    sources: Vec<TextureSource>,
}

impl TextureLibrary {
    pub fn new(
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

    pub fn slots_for(
        &mut self,
        geometry: &Kn5Geometry,
        material_id: u32,
    ) -> (Option<u32>, Option<u32>) {
        let Some(material) = geometry.materials.get(material_id as usize) else {
            return (None, None);
        };
        let named = |wanted: &str| {
            material
                .textures
                .iter()
                .find(|(sampler, _)| sampler.eq_ignore_ascii_case(wanted))
                .map(|(_, texture)| texture.clone())
        };

        let diffuse = named(DIFFUSE_SAMPLER).and_then(|name| self.index_of(&name));
        let normal = named(NORMAL_SAMPLER).and_then(|name| self.index_of(&name));
        (diffuse, normal)
    }

    /// A texture the car names but nothing can supply is not an error: the group
    /// draws untextured rather than sinking the whole preview.
    fn index_of(&mut self, name: &str) -> Option<u32> {
        if let Some(known) = self.indices.get(name) {
            return *known;
        }
        let located = self.locate(name);
        let index = located.map(|source| self.slot_for(source, name));
        self.indices.insert(name.to_string(), index);
        index
    }

    /// Two names resolving to one file share a slot. A KN5 spelling `Body.dds`
    /// while the skin folder ships `body.dds` names the same image twice, and a
    /// slot each would decode and stream it twice.
    fn slot_for(&mut self, source: TextureSource, name: &str) -> u32 {
        if let Some(held) = self.sources.iter().position(|known| *known == source) {
            return held as u32;
        }
        self.names.push(name.to_string());
        self.sources.push(source);
        (self.sources.len() - 1) as u32
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
    pub fn publish(
        self,
        state: &LiveryTextureState,
        max_texture: u32,
    ) -> Result<Vec<LiveryTexture>, AppError> {
        let mut held = state
            .0
            .lock()
            .map_err(|e| AppError::InvalidInput(e.to_string()))?;

        let generation = held.as_ref().map_or(0, |live| live.generation()) + 1;
        let textures = self
            .names
            .iter()
            .enumerate()
            .map(|(index, name)| LiveryTexture {
                name: name.clone(),
                url: texture_url(generation, index),
            })
            .collect();

        *held = Some(LiveryTextures::new(
            generation,
            max_texture,
            self.kn5,
            self.sources,
        ));

        Ok(textures)
    }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

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
        // The queue arrives over IPC and whatever it names is streamed back to
        // the webview at a guessable `livery://` address, so only a file this
        // toolkit would have decoded as artwork is allowed through.
        if is_readable_image(&path) {
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
    use crate::commands::livery_serving::{parse_texture_path, read_texture};

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

    /// The queue arrives over IPC and whatever it names is streamed back to the
    /// webview at a guessable address.
    #[test]
    fn a_queued_replacement_that_is_not_an_image_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let secret = dir.path().join("id_rsa");
        std::fs::write(&secret, b"-----BEGIN PRIVATE KEY-----").unwrap();

        let overrides = HashMap::from([("body.dds".to_string(), secret.display().to_string())]);

        assert_eq!(
            loose_file("body.dds", &overrides, &index_skin_files(dir.path())),
            None
        );
    }

    fn library(dir: &Path) -> TextureLibrary {
        TextureLibrary {
            kn5: Arc::new(Kn5File::empty()),
            skin_files: index_skin_files(dir),
            overrides: HashMap::new(),
            indices: HashMap::new(),
            names: Vec::new(),
            sources: Vec::new(),
        }
    }

    fn material(textures: &[(&str, &str)]) -> Kn5Geometry {
        Kn5Geometry {
            materials: vec![crate::parsers::kn5_mesh::Material {
                name: "paint".to_string(),
                textures: textures
                    .iter()
                    .map(|(sampler, file)| (sampler.to_string(), file.to_string()))
                    .collect(),
            }],
            meshes: vec![],
        }
    }

    /// The casing in the constants is what a KN5 usually writes, not what it has
    /// to: a model spelling it otherwise drew untextured.
    #[test]
    fn a_sampler_is_recognised_whatever_case_the_model_spells_it_in() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("body.dds"), b"skin").unwrap();
        std::fs::write(dir.path().join("body_nm.dds"), b"skin").unwrap();

        for spelling in ["txDiffuse", "txdiffuse", "TXDIFFUSE", "TxDiffuse"] {
            let geometry = material(&[(spelling, "body.dds"), ("txNORMAL", "body_nm.dds")]);
            let (diffuse, normal) = library(dir.path()).slots_for(&geometry, 0);

            assert!(diffuse.is_some(), "diffuse missed {spelling}");
            assert!(normal.is_some(), "normal missed {spelling}");
        }
    }

    #[test]
    fn a_sampler_the_preview_has_no_use_for_is_left_alone() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("body.dds"), b"skin").unwrap();

        let geometry = material(&[("txMaps", "body.dds"), ("txDetail", "body.dds")]);

        assert_eq!(library(dir.path()).slots_for(&geometry, 0), (None, None));
    }

    #[test]
    fn a_material_the_model_does_not_carry_names_no_texture() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            library(dir.path()).slots_for(&material(&[]), 7),
            (None, None)
        );
    }

    /// Both names reach one file on disk, and a slot each would decode and stream
    /// the same image twice.
    #[test]
    fn two_names_for_one_file_share_a_slot() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("body.dds"), b"skin").unwrap();

        let mut library = library(dir.path());

        assert_eq!(library.index_of("Body.dds"), Some(0));
        assert_eq!(library.index_of("body.dds"), Some(0));
        assert_eq!(library.sources.len(), 1);
    }

    #[test]
    fn a_texture_nothing_supplies_is_remembered_as_missing() {
        let dir = tempfile::tempdir().unwrap();
        let mut library = library(dir.path());

        assert_eq!(library.index_of("absent.dds"), None);
        assert_eq!(library.index_of("absent.dds"), None);
        assert!(library.sources.is_empty());
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
        state.0.lock().unwrap().as_ref().unwrap().generation()
    }
}
