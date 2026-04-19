use base64::engine::general_purpose;
use base64::Engine;
use image::DynamicImage;
use std::io::Cursor;
use std::path::Path;

use crate::converters::dds;
use crate::parsers::kn5::Kn5File;

fn image_to_data_url(img: DynamicImage) -> Result<String, String> {
    let mut png_bytes: Vec<u8> = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(&png_bytes);
    Ok(format!("data:image/png;base64,{b64}"))
}

#[tauri::command]
pub fn get_skin_texture(file_path: String) -> Result<String, String> {
    let data = std::fs::read(&file_path).map_err(|e| e.to_string())?;
    let img = dds::decode_to_image(&data).map_err(|e| e.to_string())?;
    image_to_data_url(img)
}

#[tauri::command]
pub fn get_kn5_texture(kn5_path: String, texture_name: String) -> Result<String, String> {
    let kn5 = Kn5File::open(Path::new(&kn5_path)).map_err(|e| e.to_string())?;
    let slot = kn5
        .textures
        .iter()
        .find(|t| t.name.eq_ignore_ascii_case(&texture_name))
        .ok_or_else(|| format!("Not found: {texture_name}"))?;
    let img = dds::decode_to_image(&slot.data).map_err(|e| e.to_string())?;
    image_to_data_url(img)
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
        let result = get_kn5_texture(
            f.path().to_str().unwrap().to_string(),
            "body.dds".to_string(),
        );
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn returns_data_url_for_embedded_png_texture() {
        let png = make_png_bytes();
        let f = write_temp_kn5(&[("preview.png", &png)]);
        let result = get_kn5_texture(
            f.path().to_str().unwrap().to_string(),
            "preview.png".to_string(),
        );
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn errors_on_missing_kn5_file() {
        let result = get_kn5_texture(
            "/tmp/nonexistent_file.kn5".to_string(),
            "body.dds".to_string(),
        );
        assert!(result.is_err());
        let msg = result.unwrap_err();
        assert!(msg.contains("IO") || msg.contains("os error") || msg.contains("No such file"));
    }

    #[test]
    fn errors_on_texture_not_found() {
        let dds = make_solid_dds();
        let f = write_temp_kn5(&[("body.dds", &dds)]);
        let result = get_kn5_texture(
            f.path().to_str().unwrap().to_string(),
            "other.dds".to_string(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Not found: other.dds"));
    }

    #[test]
    fn errors_on_invalid_kn5_magic() {
        let mut f = NamedTempFile::new().unwrap();
        f.write_all(b"not a kn5 file at all").unwrap();
        let result = get_kn5_texture(
            f.path().to_str().unwrap().to_string(),
            "body.dds".to_string(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid KN5 magic"));
    }

    #[test]
    fn texture_lookup_is_case_insensitive() {
        let dds = make_solid_dds();
        let f = write_temp_kn5(&[("Body.DDS", &dds)]);
        let result = get_kn5_texture(
            f.path().to_str().unwrap().to_string(),
            "body.dds".to_string(),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn get_skin_texture_returns_data_url_for_dds_file() {
        let dds = make_solid_dds();
        let mut f = NamedTempFile::new().unwrap();
        f.write_all(&dds).unwrap();
        let result = get_skin_texture(f.path().to_str().unwrap().to_string());
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn get_skin_texture_errors_on_missing_file() {
        let result = get_skin_texture("/nonexistent/path/body.dds".to_string());
        assert!(result.is_err());
    }
}
