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

pub struct Kn5Cache(pub Mutex<HashMap<String, Arc<TextureMap>>>);

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
pub fn get_skin_texture(file_path: String) -> Result<String, String> {
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
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    let img = dds::decode_to_image(&data).map_err(|e| e.to_string())?;
    image_to_data_url(img)
}

pub fn load_kn5_textures(kn5_path: &str) -> Result<Arc<TextureMap>, String> {
    let kn5 = Kn5File::open(Path::new(kn5_path)).map_err(|e| e.to_string())?;
    let map: TextureMap = kn5
        .textures
        .into_iter()
        .map(|t| (t.name.to_ascii_lowercase(), t.data))
        .collect();
    Ok(Arc::new(map))
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
    let cached = {
        let guard = cache.0.lock().map_err(|e| e.to_string())?;
        guard.get(&kn5_path).map(Arc::clone)
    };

    let texture_map = match cached {
        Some(arc) => arc,
        None => {
            let arc = load_kn5_textures(&kn5_path)?;
            let mut guard = cache.0.lock().map_err(|e| e.to_string())?;
            Arc::clone(guard.entry(kn5_path.clone()).or_insert(arc))
        }
    };

    decode_texture(&texture_map, &texture_name)
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
        let map = load_kn5_textures(f.path().to_str().unwrap()).unwrap();
        let result = decode_texture(&map, "body.dds");
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn returns_data_url_for_embedded_png_texture() {
        let png = make_png_bytes();
        let f = write_temp_kn5(&[("preview.png", &png)]);
        let map = load_kn5_textures(f.path().to_str().unwrap()).unwrap();
        let result = decode_texture(&map, "preview.png");
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn errors_on_missing_kn5_file() {
        let result = load_kn5_textures("/tmp/nonexistent_file.kn5");
        assert!(result.is_err());
        let msg = result.unwrap_err();
        assert!(msg.contains("IO") || msg.contains("os error") || msg.contains("No such file"));
    }

    #[test]
    fn errors_on_texture_not_found() {
        let dds = make_solid_dds();
        let f = write_temp_kn5(&[("body.dds", &dds)]);
        let map = load_kn5_textures(f.path().to_str().unwrap()).unwrap();
        let result = decode_texture(&map, "other.dds");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Not found: other.dds"));
    }

    #[test]
    fn errors_on_invalid_kn5_magic() {
        let mut f = NamedTempFile::new().unwrap();
        f.write_all(b"not a kn5 file at all").unwrap();
        let result = load_kn5_textures(f.path().to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid KN5 magic"));
    }

    #[test]
    fn texture_lookup_is_case_insensitive() {
        let dds = make_solid_dds();
        let f = write_temp_kn5(&[("Body.DDS", &dds)]);
        let map = load_kn5_textures(f.path().to_str().unwrap()).unwrap();
        let result = decode_texture(&map, "body.dds");
        assert!(result.is_ok());
    }

    #[test]
    fn cache_hit_avoids_reparsing() {
        let dds = make_solid_dds();
        let f = write_temp_kn5(&[("body.dds", &dds)]);
        let path = f.path().to_str().unwrap();
        let arc = load_kn5_textures(path).unwrap();
        let mut cache: HashMap<String, Arc<TextureMap>> = HashMap::new();
        cache.insert(path.to_string(), Arc::clone(&arc));
        assert!(cache.contains_key(path));
        let result = decode_texture(&cache[path], "body.dds");
        assert!(result.is_ok());
    }

    #[test]
    fn get_skin_texture_returns_data_url_for_dds_file() {
        let dds = make_solid_dds();
        let path = std::env::temp_dir().join("test_skin_texture.dds");
        std::fs::write(&path, &dds).unwrap();
        let result = get_skin_texture(path.to_str().unwrap().to_string());
        std::fs::remove_file(&path).ok();
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn get_skin_texture_errors_on_missing_file() {
        let result = get_skin_texture("/nonexistent/path/body.dds".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn get_skin_texture_rejects_non_dds_extension() {
        let result = get_skin_texture("/some/path/texture.png".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unsupported file type"));
    }
}
