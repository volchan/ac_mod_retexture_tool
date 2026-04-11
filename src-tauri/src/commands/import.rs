use crate::converters::dds;
use crate::parsers::kn5::Kn5File;
use base64::engine::general_purpose;
use base64::Engine;
use serde::Serialize;
use std::collections::HashMap;
use std::io::Cursor;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchedImportTexture {
    pub texture_id: String,
    pub source_path: String,
    pub preview_url: String,
    pub source_width: u32,
    pub source_height: u32,
    pub has_dimension_mismatch: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnmatchedImportFile {
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportScanResult {
    pub matched: Vec<MatchedImportTexture>,
    pub unmatched: Vec<UnmatchedImportFile>,
}

fn thumbnail_base64(img: &image::DynamicImage) -> String {
    let thumb = img.thumbnail(128, 128);
    let mut png_bytes: Vec<u8> = Vec::new();
    let _ = thumb.write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png);
    let b64 = general_purpose::STANDARD.encode(&png_bytes);
    format!("data:image/png;base64,{b64}")
}

fn compute_original_hash(
    mod_root: &Path,
    texture_name: &str,
    kn5_path: &str,
    skin_folder: &str,
    kn5_cache: &mut HashMap<String, Kn5File>,
) -> Option<u64> {
    let dds_data: Vec<u8> = if kn5_path.is_empty() || !skin_folder.is_empty() {
        let skin_path = mod_root.join("skins").join(skin_folder).join(texture_name);
        std::fs::read(&skin_path).ok()?
    } else if kn5_path.ends_with(".kn5") {
        let kn5 = if let Some(k) = kn5_cache.get(kn5_path) {
            k
        } else {
            kn5_cache.insert(kn5_path.to_string(), Kn5File::open(Path::new(kn5_path)).ok()?);
            kn5_cache.get(kn5_path)?
        };
        kn5.get_texture_data(texture_name)?.to_vec()
    } else {
        // kn5_path is relative from mod root (e.g. "ui/boot/preview.png")
        std::fs::read(mod_root.join(kn5_path)).ok()?
    };
    let img = dds::decode_to_image(&dds_data).ok()?;
    Some(dds::pixel_hash(&img))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn scan_import_folder(
    import_path: String,
    mod_path: String,
    texture_ids: Vec<String>,
    texture_names: Vec<String>,
    texture_widths: Vec<u32>,
    texture_heights: Vec<u32>,
    texture_kn5s: Vec<String>,
    texture_skin_folders: Vec<String>,
) -> Result<ImportScanResult, String> {
    let mut name_index: HashMap<String, usize> = HashMap::new();
    // Hero images (non-empty kn5_path that isn't a .kn5 file, no skin_folder) are matched
    // by their relative path within the import root, not by stem — multiple layouts all have
    // the same filename "preview.png" so stem-based matching would collide.
    let mut rel_path_index: HashMap<String, usize> = HashMap::new();
    for (i, name) in texture_names.iter().enumerate() {
        let kn5 = &texture_kn5s[i];
        let skin = &texture_skin_folders[i];
        if !kn5.is_empty() && skin.is_empty() && !kn5.ends_with(".kn5") {
            rel_path_index.insert(kn5.clone(), i);
            continue;
        }
        let stem = Path::new(name.as_str())
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        name_index.insert(stem, i);
    }

    let import_root = Path::new(&import_path);
    let mod_root = Path::new(&mod_path);
    let sidecar_path = import_root.join(".retexture_hashes.json");

    let stored_hashes: HashMap<String, u64> = std::fs::read_to_string(&sidecar_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let has_sidecar = !stored_hashes.is_empty();
    let has_mod_path = !mod_path.is_empty();

    let mut kn5_cache: HashMap<String, Kn5File> = HashMap::new();
    let mut computed_hashes: HashMap<String, u64> = HashMap::new();

    let mut matched: Vec<MatchedImportTexture> = Vec::new();
    let mut unmatched: Vec<UnmatchedImportFile> = Vec::new();

    for entry in WalkDir::new(import_root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path().to_path_buf();
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path.extension() else {
            continue;
        };
        if !ext.eq_ignore_ascii_case("png") {
            continue;
        }

        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let stem = path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();

        let rel_key = path.strip_prefix(import_root).ok().map(|rel| {
            rel.components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/")
        });

        let idx_opt = rel_key.as_deref().and_then(|k| rel_path_index.get(k).copied())
            .or_else(|| name_index.get(&stem).copied());

        if let Some(idx) = idx_opt {
            match image::open(&path) {
                Ok(img) => {
                    let png_hash = dds::pixel_hash(&img);

                    let is_unchanged = if has_sidecar {
                        rel_key.as_deref().and_then(|k| stored_hashes.get(k)) == Some(&png_hash)
                    } else if has_mod_path {
                        let orig_hash = compute_original_hash(
                            mod_root,
                            &texture_names[idx],
                            &texture_kn5s[idx],
                            &texture_skin_folders[idx],
                            &mut kn5_cache,
                        );
                        if let (Some(orig), Some(key)) = (orig_hash, &rel_key) {
                            computed_hashes.insert(key.clone(), orig);
                            orig == png_hash
                        } else {
                            false
                        }
                    } else {
                        false
                    };

                    if is_unchanged {
                        unmatched.push(UnmatchedImportFile {
                            name: file_name,
                            reason: "Unchanged from original extraction".to_string(),
                        });
                        continue;
                    }

                    let source_width = img.width();
                    let source_height = img.height();
                    let has_dimension_mismatch =
                        source_width != texture_widths[idx] || source_height != texture_heights[idx];

                    matched.push(MatchedImportTexture {
                        texture_id: texture_ids[idx].clone(),
                        source_path: path.to_string_lossy().to_string(),
                        preview_url: thumbnail_base64(&img),
                        source_width,
                        source_height,
                        has_dimension_mismatch,
                    });
                }
                Err(e) => {
                    unmatched.push(UnmatchedImportFile {
                        name: file_name,
                        reason: format!("Could not read image: {e}"),
                    });
                }
            }
        } else {
            unmatched.push(UnmatchedImportFile {
                name: file_name,
                reason: "No matching texture found in the mod".to_string(),
            });
        }
    }

    if !computed_hashes.is_empty() {
        if let Ok(json) = serde_json::to_string(&computed_hashes) {
            let _ = std::fs::write(&sidecar_path, json);
        }
    }

    Ok(ImportScanResult { matched, unmatched })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageBuffer, Rgba};
    use image_dds::{ImageFormat, Mipmaps, Quality, dds_from_image};
    use std::io::Write;
    use tempfile::TempDir;

    fn write_png(dir: &Path, name: &str, width: u32, height: u32) {
        write_png_color(dir, name, width, height, [255u8, 0, 0, 255]);
    }

    fn write_png_color(dir: &Path, name: &str, width: u32, height: u32, color: [u8; 4]) {
        let img = DynamicImage::ImageRgba8(ImageBuffer::from_fn(width, height, |_, _| {
            Rgba(color)
        }));
        let path = dir.join(name);
        img.save(&path).unwrap();
    }

    fn write_hash_sidecar(dir: &Path, entries: &[(&str, u64)]) {
        let map: HashMap<&str, u64> = entries.iter().cloned().collect();
        let json = serde_json::to_string(&map).unwrap();
        std::fs::write(dir.join(".retexture_hashes.json"), json).unwrap();
    }

    fn make_tiny_dds(color: [u8; 4]) -> Vec<u8> {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_fn(4, 4, |_, _| Rgba(color));
        let rgba = DynamicImage::ImageRgba8(img).to_rgba8();
        let dds =
            dds_from_image(&rgba, ImageFormat::BC1RgbaUnorm, Quality::Fast, Mipmaps::Disabled)
                .unwrap();
        let mut out = Vec::new();
        dds.write(&mut out).unwrap();
        out
    }

    fn build_minimal_kn5(texture_name: &str, dds_data: &[u8]) -> Vec<u8> {
        let mut buf: Vec<u8> = Vec::new();
        buf.write_all(b"sc6969").unwrap();
        buf.write_all(&5u32.to_le_bytes()).unwrap();
        buf.write_all(&1u32.to_le_bytes()).unwrap();
        buf.write_all(&1u32.to_le_bytes()).unwrap();
        buf.write_all(&(texture_name.len() as u32).to_le_bytes()).unwrap();
        buf.write_all(texture_name.as_bytes()).unwrap();
        buf.write_all(&(dds_data.len() as u32).to_le_bytes()).unwrap();
        buf.write_all(dds_data).unwrap();
        buf
    }

    async fn scan(
        import_path: &str,
        mod_path: &str,
        ids: Vec<&str>,
        names: Vec<&str>,
        widths: Vec<u32>,
        heights: Vec<u32>,
        kn5s: Vec<&str>,
        skins: Vec<&str>,
    ) -> ImportScanResult {
        scan_import_folder(
            import_path.to_string(),
            mod_path.to_string(),
            ids.into_iter().map(String::from).collect(),
            names.into_iter().map(String::from).collect(),
            widths,
            heights,
            kn5s.into_iter().map(String::from).collect(),
            skins.into_iter().map(String::from).collect(),
        )
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn test_unchanged_texture_is_skipped_with_sidecar() {
        let dir = TempDir::new().unwrap();
        write_png(dir.path(), "body_diffuse.png", 64, 64);

        let img = image::open(dir.path().join("body_diffuse.png")).unwrap();
        let hash = crate::converters::dds::pixel_hash(&img);
        write_hash_sidecar(dir.path(), &[("body_diffuse.png", hash)]);

        let result = scan(
            &dir.path().to_string_lossy(),
            "",
            vec!["tex1"],
            vec!["body_diffuse.dds"],
            vec![64],
            vec![64],
            vec![""],
            vec![""],
        )
        .await;

        assert_eq!(result.matched.len(), 0);
        assert_eq!(result.unmatched.len(), 1);
        assert!(result.unmatched[0].reason.contains("Unchanged"));
    }

    #[tokio::test]
    async fn test_modified_texture_is_matched_despite_sidecar() {
        let dir = TempDir::new().unwrap();
        write_png(dir.path(), "body_diffuse.png", 64, 64);
        write_hash_sidecar(dir.path(), &[("body_diffuse.png", 0)]);

        let result = scan(
            &dir.path().to_string_lossy(),
            "",
            vec!["tex1"],
            vec!["body_diffuse.dds"],
            vec![64],
            vec![64],
            vec![""],
            vec![""],
        )
        .await;

        assert_eq!(result.matched.len(), 1);
    }

    #[tokio::test]
    async fn test_unchanged_texture_skipped_via_live_kn5_comparison() {
        let mod_dir = TempDir::new().unwrap();
        let import_dir = TempDir::new().unwrap();

        let dds_data = make_tiny_dds([255, 0, 0, 255]);
        let kn5_bytes = build_minimal_kn5("body_diffuse.dds", &dds_data);
        let kn5_path = mod_dir.path().join("car.kn5");
        std::fs::write(&kn5_path, &kn5_bytes).unwrap();

        // Decode the DDS to get the exact pixels the KN5 contains, then save as PNG
        let original_img = dds::decode_to_image(&dds_data).unwrap();
        original_img
            .save(import_dir.path().join("body_diffuse.png"))
            .unwrap();

        let kn5_str = kn5_path.to_string_lossy().to_string();
        let result = scan(
            &import_dir.path().to_string_lossy(),
            &mod_dir.path().to_string_lossy(),
            vec!["tex1"],
            vec!["body_diffuse.dds"],
            vec![4],
            vec![4],
            vec![&kn5_str],
            vec![""],
        )
        .await;

        assert_eq!(result.matched.len(), 0, "unchanged texture must be skipped");
        assert_eq!(result.unmatched.len(), 1);
        assert!(result.unmatched[0].reason.contains("Unchanged"));
    }

    #[tokio::test]
    async fn test_modified_texture_matched_via_live_kn5_comparison() {
        let mod_dir = TempDir::new().unwrap();
        let import_dir = TempDir::new().unwrap();

        let dds_data = make_tiny_dds([255, 0, 0, 255]);
        let kn5_bytes = build_minimal_kn5("body_diffuse.dds", &dds_data);
        let kn5_path = mod_dir.path().join("car.kn5");
        std::fs::write(&kn5_path, &kn5_bytes).unwrap();

        // Write a PNG with DIFFERENT colors (blue vs red original) — simulates user modification
        write_png_color(import_dir.path(), "body_diffuse.png", 4, 4, [0, 0, 255, 255]);

        let kn5_str = kn5_path.to_string_lossy().to_string();
        let result = scan(
            &import_dir.path().to_string_lossy(),
            &mod_dir.path().to_string_lossy(),
            vec!["tex1"],
            vec!["body_diffuse.dds"],
            vec![4],
            vec![4],
            vec![&kn5_str],
            vec![""],
        )
        .await;

        assert_eq!(result.matched.len(), 1, "modified texture must be matched");
    }

    #[tokio::test]
    async fn test_live_comparison_writes_sidecar() {
        let mod_dir = TempDir::new().unwrap();
        let import_dir = TempDir::new().unwrap();

        let dds_data = make_tiny_dds([255, 0, 0, 255]);
        let kn5_bytes = build_minimal_kn5("body_diffuse.dds", &dds_data);
        let kn5_path = mod_dir.path().join("car.kn5");
        std::fs::write(&kn5_path, &kn5_bytes).unwrap();

        write_png_color(import_dir.path(), "body_diffuse.png", 4, 4, [0, 0, 255, 255]);

        let kn5_str = kn5_path.to_string_lossy().to_string();
        scan(
            &import_dir.path().to_string_lossy(),
            &mod_dir.path().to_string_lossy(),
            vec!["tex1"],
            vec!["body_diffuse.dds"],
            vec![4],
            vec![4],
            vec![&kn5_str],
            vec![""],
        )
        .await;

        let sidecar = import_dir.path().join(".retexture_hashes.json");
        assert!(sidecar.exists(), "sidecar must be written after live comparison");
    }

    #[tokio::test]
    async fn test_scan_matches_by_stem() {
        let dir = TempDir::new().unwrap();
        write_png(dir.path(), "body_diffuse.png", 1024, 1024);

        let result = scan(
            &dir.path().to_string_lossy(),
            "",
            vec!["tex1"],
            vec!["body_diffuse.dds"],
            vec![1024],
            vec![1024],
            vec![""],
            vec![""],
        )
        .await;

        assert_eq!(result.matched.len(), 1);
        assert_eq!(result.matched[0].texture_id, "tex1");
        assert_eq!(result.matched[0].source_width, 1024);
        assert!(!result.matched[0].has_dimension_mismatch);
        assert_eq!(result.unmatched.len(), 0);
    }

    #[tokio::test]
    async fn test_scan_case_insensitive_match() {
        let dir = TempDir::new().unwrap();
        write_png(dir.path(), "Body_Diffuse.png", 512, 512);

        let result = scan(
            &dir.path().to_string_lossy(),
            "",
            vec!["tex1"],
            vec!["body_diffuse.dds"],
            vec![512],
            vec![512],
            vec![""],
            vec![""],
        )
        .await;

        assert_eq!(result.matched.len(), 1);
        assert_eq!(result.matched[0].texture_id, "tex1");
    }

    #[tokio::test]
    async fn test_scan_unmatched_file() {
        let dir = TempDir::new().unwrap();
        write_png(dir.path(), "notes.png", 64, 64);

        let result = scan(
            &dir.path().to_string_lossy(),
            "",
            vec!["tex1"],
            vec!["body_diffuse.dds"],
            vec![64],
            vec![64],
            vec![""],
            vec![""],
        )
        .await;

        assert_eq!(result.matched.len(), 0);
        assert_eq!(result.unmatched.len(), 1);
        assert_eq!(result.unmatched[0].name, "notes.png");
    }

    #[tokio::test]
    async fn test_scan_detects_dimension_mismatch() {
        let dir = TempDir::new().unwrap();
        write_png(dir.path(), "body_diffuse.png", 2048, 2048);

        let result = scan(
            &dir.path().to_string_lossy(),
            "",
            vec!["tex1"],
            vec!["body_diffuse.dds"],
            vec![1024],
            vec![1024],
            vec![""],
            vec![""],
        )
        .await;

        assert_eq!(result.matched.len(), 1);
        assert!(result.matched[0].has_dimension_mismatch);
    }

    #[tokio::test]
    async fn test_smart_root_descends_single_subdir() {
        let outer = TempDir::new().unwrap();
        let inner = outer.path().join("livery_pack");
        std::fs::create_dir(&inner).unwrap();
        write_png(&inner, "body_diffuse.png", 512, 512);

        let result = scan(
            &outer.path().to_string_lossy(),
            "",
            vec!["tex1"],
            vec!["body_diffuse.dds"],
            vec![512],
            vec![512],
            vec![""],
            vec![""],
        )
        .await;

        assert_eq!(result.matched.len(), 1);
    }

    #[tokio::test]
    async fn test_non_png_files_ignored() {
        let dir = TempDir::new().unwrap();
        let mut f = std::fs::File::create(dir.path().join("notes.txt")).unwrap();
        f.write_all(b"hello").unwrap();

        let result = scan(
            &dir.path().to_string_lossy(),
            "",
            vec!["tex1"],
            vec!["body_diffuse.dds"],
            vec![1024],
            vec![1024],
            vec![""],
            vec![""],
        )
        .await;

        assert_eq!(result.matched.len(), 0);
        assert_eq!(result.unmatched.len(), 0);
    }
}
