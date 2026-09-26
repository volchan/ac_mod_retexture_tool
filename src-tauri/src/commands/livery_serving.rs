//! How the webview asks for a texture again.
//!
//! A car names thirty to sixty sheets, often 4096 square, so none of them
//! travels over IPC with the model. The reply carries a `livery://` address per
//! texture and this module answers those, decoding and downscaling one sheet at
//! a time as the renderer reaches it.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::http::Response;

use crate::converters::dds;
use crate::parsers::kn5::Kn5File;

pub const LIVERY_SCHEME: &str = "livery";

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

#[derive(PartialEq, Eq)]
pub enum TextureSource {
    Loose(PathBuf),
    Embedded(String),
}

impl LiveryTextures {
    pub fn new(
        generation: u64,
        max_texture: u32,
        kn5: Arc<Kn5File>,
        sources: Vec<TextureSource>,
    ) -> Self {
        Self {
            generation,
            max_texture,
            kn5,
            sources,
        }
    }

    pub fn generation(&self) -> u64 {
        self.generation
    }
}

/// Answers one `livery://localhost/<generation>/<index>` request with a PNG.
///
/// Decoding here rather than in the command spreads forty textures over the
/// webview's own parallel fetches, and keeps not one of them in memory after the
/// response is written.
///
/// The CORS header is not decoration: this scheme is a different origin from the
/// page, three asks for every texture with `crossOrigin="anonymous"`, and an
/// image refused that way still becomes a texture — one that samples black. A
/// car drawn from those is a silhouette, which reads as a paint job rather than
/// as a failure.
pub fn serve_texture(state: &LiveryTextureState, path: &str) -> Response<Vec<u8>> {
    match read_texture(state, path) {
        Some(png) => Response::builder()
            .header("Content-Type", "image/png")
            .header("Cache-Control", "no-cache")
            .header("Access-Control-Allow-Origin", "*")
            .body(png)
            .unwrap_or_else(|_| not_found()),
        None => not_found(),
    }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// Windows and Android serve custom schemes over `http`; everywhere else keeps
/// the scheme itself.
pub(crate) fn texture_url(generation: u64, index: usize) -> String {
    if cfg!(any(windows, target_os = "android")) {
        format!("http://{LIVERY_SCHEME}.localhost/{generation}/{index}")
    } else {
        format!("{LIVERY_SCHEME}://localhost/{generation}/{index}")
    }
}

pub(crate) fn read_texture(state: &LiveryTextureState, path: &str) -> Option<Vec<u8>> {
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

pub(crate) fn parse_texture_path(path: &str) -> Option<(u64, usize)> {
    let (generation, index) = path.trim_matches('/').split_once('/')?;
    Some((generation.parse().ok()?, index.parse().ok()?))
}

pub(crate) fn not_found() -> Response<Vec<u8>> {
    // An empty body and a status are all this sets, so the builder has nothing
    // to reject; a plain empty response is the harmless way to say so anyway.
    Response::builder()
        .status(404)
        .body(Vec::new())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}
