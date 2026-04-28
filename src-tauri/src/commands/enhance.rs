use base64::engine::general_purpose;
use base64::Engine;
use image::imageops::FilterType;
use std::collections::HashMap;
use std::io::Cursor;
use std::path::Path;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::ShellExt;

use crate::converters::dds::decode_to_image;
use crate::parsers::kn5::Kn5File;

const VALID_SCALES: [u8; 2] = [2, 4];
const VALID_MODELS: [&str; 2] = ["RealESRGAN_General_x4_v3", "realesr-animevideov3-x4"];

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnhanceResult {
    pub output_path: String,
    pub preview_url: String,
    pub width: u32,
    pub height: u32,
}

pub fn read_dds_from_kn5(kn5_path: &str, texture_name: &str) -> Result<Vec<u8>, String> {
    let kn5 = Kn5File::open(Path::new(kn5_path)).map_err(|e| e.to_string())?;
    let key = texture_name.to_ascii_lowercase();
    kn5.textures
        .into_iter()
        .find(|t| t.name.to_ascii_lowercase() == key)
        .map(|t| t.data)
        .ok_or_else(|| format!("texture not found: {texture_name}"))
}

pub fn read_dds_from_skin(file_path: &str, mod_path: &str) -> Result<Vec<u8>, String> {
    let canonical_mod =
        std::fs::canonicalize(mod_path).map_err(|e| format!("invalid mod path: {e}"))?;
    let resolved = if std::path::Path::new(file_path).is_absolute() {
        std::path::PathBuf::from(file_path)
    } else {
        canonical_mod.join(file_path)
    };
    let canonical_file = std::fs::canonicalize(&resolved)
        .map_err(|_| format!("file not found: {file_path}"))?;
    if !canonical_file.starts_with(&canonical_mod) {
        return Err("path escapes mod directory".to_string());
    }
    std::fs::read(&canonical_file).map_err(|e| e.to_string())
}

pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[tauri::command]
pub async fn enhance_texture(
    app: tauri::AppHandle,
    source: String,
    texture_path: String,
    texture_name: String,
    mod_path: String,
    scale: u8,
    model: String,
) -> Result<EnhanceResult, String> {
    if !VALID_SCALES.contains(&scale) {
        return Err(format!("scale must be 2 or 4, got {scale}"));
    }
    if !VALID_MODELS.contains(&model.as_str()) {
        return Err(format!("unsupported model: {model}"));
    }

    let data = if source == "kn5" {
        read_dds_from_kn5(&texture_path, &texture_name)?
    } else {
        read_dds_from_skin(&texture_path, &mod_path)?
    };

    let img = decode_to_image(&data).map_err(|e| e.to_string())?;
    let (orig_w, orig_h) = (img.width(), img.height());

    let input_tmp = tempfile::Builder::new()
        .suffix(".png")
        .tempfile()
        .map_err(|e| e.to_string())?;
    img.save(input_tmp.path()).map_err(|e| e.to_string())?;
    let input_path = input_tmp.path().to_string_lossy().to_string();

    let enhance_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("enhance_cache");
    std::fs::create_dir_all(&enhance_dir).map_err(|e| e.to_string())?;

    let safe_name = sanitize_filename(&texture_name);
    let output_path = enhance_dir.join(format!("{safe_name}_{scale}x.png"));
    let output_str = output_path.to_string_lossy().to_string();

    let model_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("models");

    let output = app
        .shell()
        .sidecar("upscayl-bin")
        .map_err(|e| e.to_string())?
        .args([
            "-i",
            &input_path,
            "-o",
            &output_str,
            "-s",
            &scale.to_string(),
            "-n",
            &model,
            "-m",
            &model_dir.to_string_lossy(),
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Real-ESRGAN failed: {stderr}"));
    }

    let enhanced = image::open(&output_path).map_err(|e| e.to_string())?;
    let resized = enhanced.resize_exact(orig_w, orig_h, FilterType::Lanczos3);
    resized.save(&output_path).map_err(|e| e.to_string())?;

    let mut png_bytes: Vec<u8> = Vec::new();
    resized
        .write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let preview_url = format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(&png_bytes)
    );

    Ok(EnhanceResult {
        output_path: output_str,
        preview_url,
        width: resized.width(),
        height: resized.height(),
    })
}

pub async fn enhance_png_in_place(
    app: &tauri::AppHandle,
    png_path: &Path,
    scale: u8,
    model: &str,
) -> Result<u64, String> {
    let img = image::open(png_path).map_err(|e| e.to_string())?;
    let (orig_w, orig_h) = (img.width(), img.height());

    let tmp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let input_path = tmp_dir.path().join("input.png");
    let out_path = tmp_dir.path().join("out.png");

    img.save(&input_path).map_err(|e| e.to_string())?;

    let model_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("models");

    let output = app
        .shell()
        .sidecar("upscayl-bin")
        .map_err(|e| e.to_string())?
        .args([
            "-i",
            &input_path.to_string_lossy(),
            "-o",
            &out_path.to_string_lossy(),
            "-s",
            &scale.to_string(),
            "-n",
            model,
            "-m",
            &model_dir.to_string_lossy(),
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("upscayl-bin failed: {stderr}"));
    }

    let enhanced = image::open(&out_path).map_err(|e| e.to_string())?;
    let resized = enhanced.resize_exact(orig_w, orig_h, FilterType::Lanczos3);
    resized.save(png_path).map_err(|e| e.to_string())?;

    Ok(crate::converters::dds::pixel_hash(&resized))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn enhance_extracted_textures(
    app: tauri::AppHandle,
    output_dir: String,
    mod_name: String,
    texture_names: Vec<String>,
    texture_kn5s: Vec<String>,
    texture_skin_folders: Vec<String>,
    scale: u8,
    model: String,
) -> Result<Vec<String>, String> {
    if !VALID_SCALES.contains(&scale) {
        return Err(format!("scale must be 2 or 4, got {scale}"));
    }
    if !VALID_MODELS.contains(&model.as_str()) {
        return Err(format!("unsupported model: {model}"));
    }

    let out_root = Path::new(&output_dir);
    let mod_out = out_root.join(&mod_name);
    let total = texture_names.len();
    let mut errors: Vec<String> = Vec::new();

    let hash_path = mod_out.join(".retexture_hashes.json");
    let mut hashes: HashMap<String, u64> = hash_path
        .exists()
        .then(|| std::fs::read_to_string(&hash_path).ok())
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    for (i, name) in texture_names.iter().enumerate() {
        let kn5_path = &texture_kn5s[i];
        let skin_folder = &texture_skin_folders[i];

        let png_path = crate::commands::extract::build_output_path(
            out_root, &mod_name, name, kn5_path, skin_folder,
        );

        match enhance_png_in_place(&app, &png_path, scale, &model).await {
            Ok(hash) => {
                if let Ok(rel) = png_path.strip_prefix(&mod_out) {
                    let key = rel
                        .components()
                        .map(|c| c.as_os_str().to_string_lossy().into_owned())
                        .collect::<Vec<_>>()
                        .join("/");
                    hashes.insert(key, hash);
                }
            }
            Err(e) => errors.push(format!("{name}: {e}")),
        }

        let _ = app.emit(
            "enhance-progress",
            serde_json::json!({
                "current": i + 1,
                "total": total,
                "label": name,
            }),
        );
    }

    if !hashes.is_empty() {
        if let Ok(json) = serde_json::to_string(&hashes) {
            let _ = std::fs::write(&hash_path, json);
        }
    }

    Ok(errors)
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

    fn build_minimal_kn5(textures: &[(&str, &[u8])]) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(b"sc6969");
        out.extend_from_slice(&1u32.to_le_bytes());
        out.extend_from_slice(&(textures.len() as u32).to_le_bytes());
        for (name, data) in textures {
            out.extend_from_slice(&1u32.to_le_bytes());
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
    fn read_dds_from_kn5_returns_texture_data() {
        let dds = make_solid_dds();
        let f = write_temp_kn5(&[("body.dds", &dds)]);
        let result = read_dds_from_kn5(f.path().to_str().unwrap(), "body.dds");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), dds);
    }

    #[test]
    fn read_dds_from_kn5_is_case_insensitive() {
        let dds = make_solid_dds();
        let f = write_temp_kn5(&[("Body.DDS", &dds)]);
        let result = read_dds_from_kn5(f.path().to_str().unwrap(), "body.dds");
        assert!(result.is_ok());
    }

    #[test]
    fn read_dds_from_kn5_errors_on_missing_texture() {
        let dds = make_solid_dds();
        let f = write_temp_kn5(&[("body.dds", &dds)]);
        let result = read_dds_from_kn5(f.path().to_str().unwrap(), "other.dds");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("texture not found"));
    }

    #[test]
    fn read_dds_from_kn5_errors_on_missing_file() {
        let result = read_dds_from_kn5("/tmp/nonexistent.kn5", "body.dds");
        assert!(result.is_err());
    }

    #[test]
    fn read_dds_from_skin_returns_file_data_absolute() {
        let dds = make_solid_dds();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("body.dds");
        std::fs::write(&path, &dds).unwrap();
        let result = read_dds_from_skin(
            path.to_str().unwrap(),
            dir.path().to_str().unwrap(),
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), dds);
    }

    #[test]
    fn read_dds_from_skin_resolves_relative_path() {
        let dds = make_solid_dds();
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("ui")).unwrap();
        let path = dir.path().join("ui").join("preview.png");
        std::fs::write(&path, &dds).unwrap();
        let result = read_dds_from_skin(
            "ui/preview.png",
            dir.path().to_str().unwrap(),
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), dds);
    }

    #[test]
    fn read_dds_from_skin_rejects_path_traversal() {
        let root = tempfile::tempdir().unwrap();
        let mod_dir = root.path().join("mod");
        std::fs::create_dir(&mod_dir).unwrap();
        let outside = root.path().join("secret.dds");
        std::fs::write(&outside, b"secret").unwrap();
        let result = read_dds_from_skin(
            outside.to_str().unwrap(),
            mod_dir.to_str().unwrap(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("escapes mod directory"));
    }

    #[test]
    fn read_dds_from_skin_errors_on_missing_file() {
        let dir = tempfile::tempdir().unwrap();
        let result = read_dds_from_skin(
            dir.path().join("nonexistent.dds").to_str().unwrap(),
            dir.path().to_str().unwrap(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn sanitize_filename_keeps_safe_chars() {
        assert_eq!(sanitize_filename("body_diffuse-1"), "body_diffuse-1");
    }

    #[test]
    fn sanitize_filename_replaces_unsafe_chars() {
        assert_eq!(sanitize_filename("body.dds"), "body_dds");
        assert_eq!(sanitize_filename("my texture!"), "my_texture_");
    }

    #[test]
    fn sanitize_filename_handles_empty_string() {
        assert_eq!(sanitize_filename(""), "");
    }
}
