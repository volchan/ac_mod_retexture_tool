use base64::engine::general_purpose;
use base64::Engine;
use image::DynamicImage;
use std::collections::HashMap;
use std::io::Cursor;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::State;

use crate::converters::dds;
use crate::parsers::kn5::Kn5File;

pub type TextureMap = HashMap<String, Vec<u8>>;

// Per-path slot: Mutex serializes concurrent loads for the same KN5 file.
// Option is None until first successful load; failed loads leave it None so callers retry.
type CacheSlot = Mutex<Option<Arc<TextureMap>>>;

pub struct Kn5Cache(pub Mutex<HashMap<String, Arc<CacheSlot>>>);

impl Default for Kn5Cache {
    fn default() -> Self {
        Kn5Cache(Mutex::new(HashMap::new()))
    }
}

fn image_to_data_url(img: DynamicImage) -> Result<String, String> {
    let mut png_bytes: Vec<u8> = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(&png_bytes);
    Ok(format!("data:image/png;base64,{b64}"))
}

#[tauri::command]
pub fn get_skin_texture(mod_path: String, file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    if ext.as_deref() != Some("dds") {
        return Err(format!(
            "unsupported file type: expected .dds, got {:?}",
            ext.as_deref().unwrap_or("none")
        ));
    }
    let canonical_mod =
        std::fs::canonicalize(&mod_path).map_err(|e| format!("invalid mod path: {e}"))?;
    let canonical_file =
        std::fs::canonicalize(path).map_err(|e| format!("invalid file path: {e}"))?;
    if !canonical_file.starts_with(&canonical_mod) {
        return Err("path escapes mod directory".to_string());
    }
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    let img = dds::decode_to_image(&data).map_err(|e| e.to_string())?;
    image_to_data_url(img)
}

pub fn build_texture_map(kn5_path: &str) -> Result<TextureMap, String> {
    let kn5 = Kn5File::open(Path::new(kn5_path)).map_err(|e| e.to_string())?;
    Ok(kn5
        .textures
        .into_iter()
        .map(|t| (t.name.to_ascii_lowercase(), t.data))
        .collect())
}

pub fn decode_texture(texture_map: &TextureMap, texture_name: &str) -> Result<String, String> {
    let key = texture_name.to_ascii_lowercase();
    let data = texture_map
        .get(&key)
        .ok_or_else(|| format!("Not found: {texture_name}"))?;
    let img = dds::decode_to_image(data).map_err(|e| e.to_string())?;
    image_to_data_url(img)
}

#[tauri::command]
pub fn get_kn5_texture(
    kn5_path: String,
    texture_name: String,
    cache: State<'_, Kn5Cache>,
) -> Result<String, String> {
    // Step 1: acquire (or insert) the per-path slot under a brief main-cache lock.
    let slot: Arc<CacheSlot> = {
        let mut guard = cache.0.lock().map_err(|e| e.to_string())?;
        Arc::clone(
            guard
                .entry(kn5_path.clone())
                .or_insert_with(|| Arc::new(Mutex::new(None))),
        )
    };

    // Step 2: lock the per-path slot; only one thread loads a given KN5 at a time.
    let texture_arc: Arc<TextureMap> = {
        let mut slot_guard = slot.lock().map_err(|e| e.to_string())?;
        if let Some(ref arc) = *slot_guard {
            Arc::clone(arc)
        } else {
            let arc = Arc::new(build_texture_map(&kn5_path)?);
            *slot_guard = Some(Arc::clone(&arc));
            arc
        }
    };

    // Step 3: decode outside any lock.
    decode_texture(&texture_arc, &texture_name)
}

#[tauri::command]
pub fn clear_kn5_cache(cache: State<'_, Kn5Cache>) -> Result<(), String> {
    let mut guard = cache.0.lock().map_err(|e| e.to_string())?;
    guard.clear();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageBuffer, Rgba};
    use image_dds::{dds_from_image, ImageFormat, Mipmaps, Quality};
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn make_solid_dds() -> Vec<u8> {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_fn(8, 8, |_, _| Rgba([255, 0, 0, 255]));
        let rgba = DynamicImage::ImageRgba8(img).to_rgba8();
        let dds = dds_from_image(
            &rgba,
            ImageFormat::BC1RgbaUnorm,
            Quality::Fast,
            Mipmaps::Disabled,
        )
        .unwrap();
        let mut out = Vec::new();
        dds.write(&mut out).unwrap();
        out
    }

    fn make_png_bytes() -> Vec<u8> {
        let img =
            DynamicImage::ImageRgba8(ImageBuffer::from_fn(4, 4, |_, _| Rgba([0, 0, 255, 255])));
        let mut png_bytes: Vec<u8> = Vec::new();
        img.write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png)
            .unwrap();
        png_bytes
    }

    fn build_minimal_kn5(textures: &[(&str, &[u8])]) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(b"sc6969");
        out.extend_from_slice(&1u32.to_le_bytes()); // version
        out.extend_from_slice(&(textures.len() as u32).to_le_bytes()); // texture count
        for (name, data) in textures {
            out.extend_from_slice(&1u32.to_le_bytes()); // active
            let name_bytes = name.as_bytes();
            out.extend_from_slice(&(name_bytes.len() as u32).to_le_bytes());
            out.extend_from_slice(name_bytes);
            out.extend_from_slice(&(data.len() as u32).to_le_bytes());
            out.extend_from_slice(data);
        }
        out
    }

    fn write_temp_kn5(textures: &[(&str, &[u8])]) -> NamedTempFile {
        let kn5_data = build_minimal_kn5(textures);
        let mut f = NamedTempFile::new().unwrap();
        f.write_all(&kn5_data).unwrap();
        f
    }

    #[test]
    fn returns_data_url_for_valid_dds_texture() {
        let dds = make_solid_dds();
        let f = write_temp_kn5(&[("body.dds", &dds)]);
        let map = build_texture_map(f.path().to_str().unwrap()).unwrap();
        let result = decode_texture(&map, "body.dds");
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn returns_data_url_for_embedded_png_texture() {
        let png = make_png_bytes();
        let f = write_temp_kn5(&[("preview.png", &png)]);
        let map = build_texture_map(f.path().to_str().unwrap()).unwrap();
        let result = decode_texture(&map, "preview.png");
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn errors_on_missing_kn5_file() {
        let result = build_texture_map("/tmp/nonexistent_file.kn5");
        assert!(result.is_err());
        let msg = result.unwrap_err();
        assert!(msg.contains("IO") || msg.contains("os error") || msg.contains("No such file"));
    }

    #[test]
    fn errors_on_texture_not_found() {
        let dds = make_solid_dds();
        let f = write_temp_kn5(&[("body.dds", &dds)]);
        let map = build_texture_map(f.path().to_str().unwrap()).unwrap();
        let result = decode_texture(&map, "other.dds");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Not found: other.dds"));
    }

    #[test]
    fn errors_on_invalid_kn5_magic() {
        let mut f = NamedTempFile::new().unwrap();
        f.write_all(b"not a kn5 file at all").unwrap();
        let result = build_texture_map(f.path().to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid KN5 magic"));
    }

    #[test]
    fn texture_lookup_is_case_insensitive() {
        let dds = make_solid_dds();
        let f = write_temp_kn5(&[("Body.DDS", &dds)]);
        let map = build_texture_map(f.path().to_str().unwrap()).unwrap();
        let result = decode_texture(&map, "body.dds");
        assert!(result.is_ok());
    }

    #[test]
    fn cache_slot_is_populated_on_first_load_and_reused() {
        let dds = make_solid_dds();
        let f = write_temp_kn5(&[("body.dds", &dds)]);
        let path = f.path().to_str().unwrap();
        let slot: Arc<CacheSlot> = Arc::new(Mutex::new(None));

        // First access: loads from disk
        {
            let mut guard = slot.lock().unwrap();
            let arc = Arc::new(build_texture_map(path).unwrap());
            *guard = Some(Arc::clone(&arc));
        }

        // Second access: reuses cached arc
        let arc = slot.lock().unwrap().clone().unwrap();
        let result = decode_texture(&arc, "body.dds");
        assert!(result.is_ok());
    }

    #[test]
    fn get_skin_texture_returns_data_url_for_dds_file() {
        let dds = make_solid_dds();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("body.dds");
        std::fs::write(&path, &dds).unwrap();
        let result = get_skin_texture(
            dir.path().to_str().unwrap().to_string(),
            path.to_str().unwrap().to_string(),
        );
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn get_skin_texture_errors_on_missing_file() {
        let dir = tempfile::tempdir().unwrap();
        let result = get_skin_texture(
            dir.path().to_str().unwrap().to_string(),
            dir.path()
                .join("nonexistent.dds")
                .to_str()
                .unwrap()
                .to_string(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn get_skin_texture_rejects_non_dds_extension() {
        let dir = tempfile::tempdir().unwrap();
        let result = get_skin_texture(
            dir.path().to_str().unwrap().to_string(),
            "/some/path/texture.png".to_string(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unsupported file type"));
    }

    #[test]
    fn get_skin_texture_rejects_path_outside_mod_dir() {
        let dds = make_solid_dds();
        let root = tempfile::tempdir().unwrap();
        let mod_dir = root.path().join("mod");
        std::fs::create_dir(&mod_dir).unwrap();
        let outside = root.path().join("secret.dds");
        std::fs::write(&outside, &dds).unwrap();
        let result = get_skin_texture(
            mod_dir.to_str().unwrap().to_string(),
            outside.to_str().unwrap().to_string(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("escapes mod directory"));
    }
}
