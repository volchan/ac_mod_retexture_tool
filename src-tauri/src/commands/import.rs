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

#[tauri::command]
pub async fn scan_import_folder(
    import_path: String,
    texture_ids: Vec<String>,
    texture_names: Vec<String>,
    texture_widths: Vec<u32>,
    texture_heights: Vec<u32>,
) -> Result<ImportScanResult, String> {
    let mut name_index: HashMap<String, usize> = HashMap::new();
    for (i, name) in texture_names.iter().enumerate() {
        let stem = Path::new(name.as_str())
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        name_index.insert(stem, i);
    }

    let mut matched: Vec<MatchedImportTexture> = Vec::new();
    let mut unmatched: Vec<UnmatchedImportFile> = Vec::new();

    for entry in WalkDir::new(&import_path).into_iter().filter_map(|e| e.ok()) {
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

        if let Some(&idx) = name_index.get(&stem) {
            match image::open(&path) {
                Ok(img) => {
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

    Ok(ImportScanResult { matched, unmatched })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageBuffer, Rgba};
    use std::io::Write;
    use tempfile::TempDir;

    fn write_png(dir: &Path, name: &str, width: u32, height: u32) {
        let img = DynamicImage::ImageRgba8(ImageBuffer::from_fn(width, height, |_, _| {
            Rgba([255u8, 0, 0, 255])
        }));
        let path = dir.join(name);
        img.save(&path).unwrap();
    }

    #[tokio::test]
    async fn test_scan_matches_by_stem() {
        let dir = TempDir::new().unwrap();
        write_png(dir.path(), "body_diffuse.png", 1024, 1024);

        let result = scan_import_folder(
            dir.path().to_string_lossy().to_string(),
            vec!["tex1".to_string()],
            vec!["body_diffuse.dds".to_string()],
            vec![1024],
            vec![1024],
        )
        .await
        .unwrap();

        assert_eq!(result.matched.len(), 1);
        assert_eq!(result.matched[0].texture_id, "tex1");
        assert_eq!(result.matched[0].source_width, 1024);
        assert_eq!(result.matched[0].has_dimension_mismatch, false);
        assert_eq!(result.unmatched.len(), 0);
    }

    #[tokio::test]
    async fn test_scan_case_insensitive_match() {
        let dir = TempDir::new().unwrap();
        write_png(dir.path(), "Body_Diffuse.png", 512, 512);

        let result = scan_import_folder(
            dir.path().to_string_lossy().to_string(),
            vec!["tex1".to_string()],
            vec!["body_diffuse.dds".to_string()],
            vec![512],
            vec![512],
        )
        .await
        .unwrap();

        assert_eq!(result.matched.len(), 1);
        assert_eq!(result.matched[0].texture_id, "tex1");
    }

    #[tokio::test]
    async fn test_scan_unmatched_file() {
        let dir = TempDir::new().unwrap();
        write_png(dir.path(), "notes.png", 64, 64);

        let result = scan_import_folder(
            dir.path().to_string_lossy().to_string(),
            vec!["tex1".to_string()],
            vec!["body_diffuse.dds".to_string()],
            vec![64],
            vec![64],
        )
        .await
        .unwrap();

        assert_eq!(result.matched.len(), 0);
        assert_eq!(result.unmatched.len(), 1);
        assert_eq!(result.unmatched[0].name, "notes.png");
    }

    #[tokio::test]
    async fn test_scan_detects_dimension_mismatch() {
        let dir = TempDir::new().unwrap();
        write_png(dir.path(), "body_diffuse.png", 2048, 2048);

        let result = scan_import_folder(
            dir.path().to_string_lossy().to_string(),
            vec!["tex1".to_string()],
            vec!["body_diffuse.dds".to_string()],
            vec![1024],
            vec![1024],
        )
        .await
        .unwrap();

        assert_eq!(result.matched.len(), 1);
        assert!(result.matched[0].has_dimension_mismatch);
    }

    #[tokio::test]
    async fn test_smart_root_descends_single_subdir() {
        let outer = TempDir::new().unwrap();
        let inner = outer.path().join("livery_pack");
        std::fs::create_dir(&inner).unwrap();
        write_png(&inner, "body_diffuse.png", 512, 512);

        let result = scan_import_folder(
            outer.path().to_string_lossy().to_string(),
            vec!["tex1".to_string()],
            vec!["body_diffuse.dds".to_string()],
            vec![512],
            vec![512],
        )
        .await
        .unwrap();

        assert_eq!(result.matched.len(), 1);
    }

    #[tokio::test]
    async fn test_non_png_files_ignored() {
        let dir = TempDir::new().unwrap();
        let mut f = std::fs::File::create(dir.path().join("notes.txt")).unwrap();
        f.write_all(b"hello").unwrap();

        let result = scan_import_folder(
            dir.path().to_string_lossy().to_string(),
            vec!["tex1".to_string()],
            vec!["body_diffuse.dds".to_string()],
            vec![1024],
            vec![1024],
        )
        .await
        .unwrap();

        assert_eq!(result.matched.len(), 0);
        assert_eq!(result.unmatched.len(), 0);
    }
}
