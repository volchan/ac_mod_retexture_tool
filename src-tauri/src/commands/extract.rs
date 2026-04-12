use crate::converters::dds;
use crate::errors::AppError;
use crate::parsers::kn5::Kn5File;
use std::collections::HashMap;
use std::path::Path;
use tauri::{AppHandle, Emitter};

fn to_png_name(texture_name: &str) -> String {
    let stem = Path::new(texture_name)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy();
    format!("{stem}.png")
}

pub fn build_output_path(
    out_root: &Path,
    mod_name: &str,
    texture_name: &str,
    kn5_path: &str,
    skin_folder: &str,
) -> std::path::PathBuf {
    let png_name = to_png_name(texture_name);
    if kn5_path.is_empty() || !skin_folder.is_empty() {
        out_root
            .join(mod_name)
            .join("skins")
            .join(skin_folder)
            .join(png_name)
    } else if kn5_path.ends_with(".kn5") {
        let kn5_name = Path::new(kn5_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        out_root.join(mod_name).join(&kn5_name).join(png_name)
    } else {
        // kn5_path is a relative path from mod root (e.g. "ui/boot/preview.png")
        out_root.join(mod_name).join(kn5_path)
    }
}

#[tauri::command]
pub async fn extract_textures(
    app: AppHandle,
    mod_path: String,
    texture_ids: Vec<String>,
    texture_names: Vec<String>,
    texture_kn5s: Vec<String>,
    texture_skin_folders: Vec<String>,
    output_dir: String,
) -> Result<Vec<String>, String> {
    let out = std::path::PathBuf::from(&output_dir);
    let mod_root = std::path::PathBuf::from(&mod_path);
    let mod_name = mod_root
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let _ = texture_ids;

    let mut kn5_cache: HashMap<String, Kn5File> = HashMap::new();
    let mut errors: Vec<String> = Vec::new();
    let mut hashes: HashMap<String, u64> = HashMap::new();
    let total = texture_names.len();
    let mod_out = out.join(&mod_name);

    for (i, name) in texture_names.iter().enumerate() {
        let kn5_path = &texture_kn5s[i];
        let skin_folder = &texture_skin_folders[i];

        let result: Result<(), AppError> = (|| {
            let out_file = build_output_path(&out, &mod_name, name, kn5_path, skin_folder);
            if let Some(parent) = out_file.parent() {
                std::fs::create_dir_all(parent)?;
            }

            // Loading screen PNG: copy verbatim to preserve full quality.
            // kn5_path is the relative path from mod root (e.g. "ui/boot/preview.png").
            if !kn5_path.is_empty() && skin_folder.is_empty() && !kn5_path.ends_with(".kn5") {
                let src = mod_root.join(kn5_path);
                std::fs::copy(&src, &out_file)?;
                let img = image::open(src).map_err(|e| AppError::ImageDecode(e.to_string()))?;
                let hash = dds::pixel_hash(&img);
                if let Ok(rel) = out_file.strip_prefix(&mod_out) {
                    let key = rel
                        .components()
                        .map(|c| c.as_os_str().to_string_lossy().into_owned())
                        .collect::<Vec<_>>()
                        .join("/");
                    hashes.insert(key, hash);
                }
                return Ok(());
            }

            let dds_data: Vec<u8> = if kn5_path.is_empty() || !skin_folder.is_empty() {
                let skin_path = mod_root.join("skins").join(skin_folder).join(name);
                std::fs::read(&skin_path)?
            } else {
                let kn5 = if let Some(k) = kn5_cache.get(kn5_path) {
                    k
                } else {
                    kn5_cache.insert(kn5_path.clone(), Kn5File::open(Path::new(kn5_path))?);
                    kn5_cache.get(kn5_path).unwrap()
                };
                kn5.get_texture_data(name)
                    .ok_or_else(|| AppError::NotFound(name.clone()))?
                    .to_vec()
            };

            let img = dds::decode_to_image(&dds_data)?;
            let hash = dds::pixel_hash(&img);
            img.save(&out_file)
                .map_err(|e| AppError::ImageEncode(e.to_string()))?;

            if let Ok(rel) = out_file.strip_prefix(&mod_out) {
                let key = rel
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join("/");
                hashes.insert(key, hash);
            }

            Ok(())
        })();

        if let Err(e) = result {
            errors.push(format!("{name}: {e}"));
        }

        let _ = app.emit(
            "extract-progress",
            serde_json::json!({
                "current": i + 1,
                "total": total,
                "label": name,
            }),
        );
    }

    if !hashes.is_empty() {
        if let Ok(json) = serde_json::to_string(&hashes) {
            let _ = std::fs::write(mod_out.join(".retexture_hashes.json"), json);
        }
    }

    Ok(errors)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageBuffer, Rgba};
    use image_dds::{dds_from_image, ImageFormat, Mipmaps, Quality};

    fn build_minimal_kn5_with_dds(texture_name: &str, dds_data: &[u8]) -> Vec<u8> {
        use std::io::Write;
        let mut buf: Vec<u8> = Vec::new();
        buf.write_all(b"sc6969").unwrap();
        buf.write_all(&5u32.to_le_bytes()).unwrap(); // version 5 — no unknown field
        buf.write_all(&1u32.to_le_bytes()).unwrap(); // texture count
        buf.write_all(&1u32.to_le_bytes()).unwrap(); // active flag
        buf.write_all(&(texture_name.len() as u32).to_le_bytes())
            .unwrap();
        buf.write_all(texture_name.as_bytes()).unwrap();
        buf.write_all(&(dds_data.len() as u32).to_le_bytes())
            .unwrap();
        buf.write_all(dds_data).unwrap();
        buf
    }

    fn make_tiny_dds() -> Vec<u8> {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_fn(4, 4, |_, _| Rgba([255, 0, 0, 255]));
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

    #[test]
    fn build_output_path_for_kn5_texture() {
        let out_root = Path::new("/output");
        let path = build_output_path(out_root, "ferrari", "body.dds", "/mods/ferrari/car.kn5", "");
        assert_eq!(path, Path::new("/output/ferrari/car.kn5/body.png"));
    }

    #[test]
    fn build_output_path_for_skin_texture() {
        let out_root = Path::new("/output");
        let path = build_output_path(out_root, "ferrari", "livery.dds", "", "skin_01");
        assert_eq!(path, Path::new("/output/ferrari/skins/skin_01/livery.png"));
    }

    #[test]
    fn to_png_name_with_png_extension_does_not_double() {
        let out_root = Path::new("/output");
        let path = build_output_path(
            out_root,
            "watkins",
            "livery.png",
            "/mods/watkins/track.kn5",
            "",
        );
        assert_eq!(path, Path::new("/output/watkins/track.kn5/livery.png"));
    }

    #[test]
    fn build_output_path_for_loading_screen_root() {
        let out_root = Path::new("/output");
        let path = build_output_path(out_root, "monza", "preview.png", "ui/preview.png", "");
        assert_eq!(path, Path::new("/output/monza/ui/preview.png"));
    }

    #[test]
    fn build_output_path_for_loading_screen_multilayout() {
        let out_root = Path::new("/output");
        let path = build_output_path(
            out_root,
            "monza",
            "preview_boot.png",
            "ui/boot/preview.png",
            "",
        );
        assert_eq!(path, Path::new("/output/monza/ui/boot/preview.png"));
    }

    #[test]
    fn build_output_path_for_skin_texture_strips_dds_extension() {
        let out_root = Path::new("/output");
        let path = build_output_path(
            out_root,
            "ferrari",
            "decal.dds",
            "/mods/ferrari/car.kn5",
            "skin_01",
        );
        assert_eq!(path, Path::new("/output/ferrari/skins/skin_01/decal.png"));
    }

    #[test]
    fn test_extract_creates_output_structure() {
        let dds_data = make_tiny_dds();
        let kn5_bytes = build_minimal_kn5_with_dds("body.dds", &dds_data);

        let tmp_dir = tempfile::tempdir().unwrap();
        let kn5_path = tmp_dir.path().join("car.kn5");
        std::fs::write(&kn5_path, &kn5_bytes).unwrap();

        let output_dir = tempfile::tempdir().unwrap();
        let out_root = output_dir.path();

        let mod_name = "ferrari";
        let texture_name = "body.dds";
        let kn5_str = kn5_path.to_string_lossy().to_string();

        let out_file = build_output_path(out_root, mod_name, texture_name, &kn5_str, "");
        if let Some(parent) = out_file.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }

        let mut kn5_cache: HashMap<String, Kn5File> = HashMap::new();
        kn5_cache.insert(kn5_str.clone(), Kn5File::open(&kn5_path).unwrap());
        let kn5 = kn5_cache.get(&kn5_str).unwrap();
        let raw = kn5.get_texture_data(texture_name).unwrap();
        let img = dds::decode_to_image(raw).unwrap();
        img.save(&out_file).unwrap();

        assert!(out_file.exists());
    }

    #[test]
    fn test_extract_missing_texture_returns_error_string() {
        let dds_data = make_tiny_dds();
        let kn5_bytes = build_minimal_kn5_with_dds("body.dds", &dds_data);

        let tmp_dir = tempfile::tempdir().unwrap();
        let kn5_path = tmp_dir.path().join("car.kn5");
        std::fs::write(&kn5_path, &kn5_bytes).unwrap();

        let kn5 = Kn5File::open(&kn5_path).unwrap();
        let result = kn5.get_texture_data("nonexistent.dds");
        assert!(result.is_none());
    }
}
