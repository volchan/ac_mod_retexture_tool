use base64::engine::general_purpose;
use base64::Engine;
use image::imageops::FilterType;
use serde::Serialize;
use std::io::Cursor;
use std::path::Path;

const THUMBNAIL_MAX: u32 = 256;
const PREVIEW_FILENAME: &str = "preview.png";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackLayoutHero {
    pub label: String,
    pub filename: String,
    pub url: Option<String>,
}

fn read_png_as_data_url(path: &Path) -> Result<String, String> {
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(&data);
    Ok(format!("data:image/png;base64,{b64}"))
}

#[tauri::command]
pub fn list_track_hero_images(mod_path: String) -> Result<Vec<TrackLayoutHero>, String> {
    let root = Path::new(&mod_path);

    // Single-layout: preview.png in root or ui/
    let flat = [
        root.join(PREVIEW_FILENAME),
        root.join("ui").join(PREVIEW_FILENAME),
    ];
    for path in &flat {
        if path.exists() {
            let url = read_png_as_data_url(path).ok();
            return Ok(vec![TrackLayoutHero {
                label: "Loading screen".to_string(),
                filename: PREVIEW_FILENAME.to_string(),
                url,
            }]);
        }
    }

    // Multi-layout: ui/<layout>/preview.png
    let ui_path = root.join("ui");
    if ui_path.is_dir() {
        let mut layout_entries: Vec<_> = std::fs::read_dir(&ui_path)
            .map_err(|e| e.to_string())?
            .flatten()
            .filter(|e| e.path().is_dir())
            .collect();
        layout_entries.sort_by_key(|e| e.file_name());

        if !layout_entries.is_empty() {
            let mut results = Vec::new();
            for entry in layout_entries {
                let sub = entry.path();
                let layout = sub
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let candidate = sub.join(PREVIEW_FILENAME);
                let url = if candidate.exists() {
                    read_png_as_data_url(&candidate).ok()
                } else {
                    None
                };
                results.push(TrackLayoutHero {
                    label: format!("Loading screen ({layout})"),
                    filename: format!("ui/{layout}/{PREVIEW_FILENAME}"),
                    url,
                });
            }
            return Ok(results);
        }
    }

    // Fallback: no image found
    Ok(vec![TrackLayoutHero {
        label: "Loading screen".to_string(),
        filename: PREVIEW_FILENAME.to_string(),
        url: None,
    }])
}

#[tauri::command]
pub fn get_track_hero_image(mod_path: String, filename: String) -> Result<Option<String>, String> {
    let root = Path::new(&mod_path);
    let flat = [root.join(&filename), root.join("ui").join(&filename)];
    if let Some(path) = flat.iter().find(|p| p.exists()) {
        return Ok(Some(read_png_as_data_url(path)?));
    }
    let ui_path = root.join("ui");
    if ui_path.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&ui_path) {
            for entry in entries.flatten() {
                let sub = entry.path();
                if sub.is_dir() {
                    let candidate = sub.join(&filename);
                    if candidate.exists() {
                        return Ok(Some(read_png_as_data_url(&candidate)?));
                    }
                }
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn extract_track_hero_image(
    mod_path: String,
    filename: String,
    output_path: String,
) -> Result<(), String> {
    let src = Path::new(&mod_path).join(&filename);
    let dst = Path::new(&output_path);
    std::fs::copy(&src, dst).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn preview_replacement_image(image_path: String) -> Result<String, String> {
    let img = image::open(&image_path).map_err(|e| e.to_string())?;
    let resized = img.resize(THUMBNAIL_MAX, THUMBNAIL_MAX, FilterType::Lanczos3);
    let mut png_bytes: Vec<u8> = Vec::new();
    resized
        .write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(&png_bytes);
    Ok(format!("data:image/png;base64,{b64}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageBuffer, Rgba};
    use std::io::Write;

    fn write_red_png(path: &std::path::Path) {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_fn(64, 64, |_, _| Rgba([255, 0, 0, 255]));
        DynamicImage::ImageRgba8(img)
            .save(path)
            .unwrap();
    }

    #[test]
    fn get_track_hero_image_returns_image_from_ui_layout_subdir() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let layout_dir = tmp_dir.path().join("ui").join("boot");
        std::fs::create_dir_all(&layout_dir).unwrap();
        let file_path = layout_dir.join("preview.png");
        write_red_png(&file_path);

        let result = get_track_hero_image(
            tmp_dir.path().to_string_lossy().to_string(),
            "preview.png".to_string(),
        );
        assert!(result.is_ok());
        assert!(result.unwrap().is_some());
    }

    #[test]
    fn get_track_hero_image_returns_none_when_file_missing() {
        let result = get_track_hero_image("/nonexistent/path".to_string(), "preview.png".to_string());
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn get_track_hero_image_returns_data_url_when_found() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let file_path = tmp_dir.path().join("preview.png");
        write_red_png(&file_path);

        let result = get_track_hero_image(
            tmp_dir.path().to_string_lossy().to_string(),
            "preview.png".to_string(),
        );
        assert!(result.is_ok());
        let url = result.unwrap().unwrap();
        assert!(url.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn extract_track_hero_image_copies_file() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let src_path = tmp_dir.path().join("preview.png");
        write_red_png(&src_path);

        let dst_path = tmp_dir.path().join("output.png");

        let result = extract_track_hero_image(
            tmp_dir.path().to_string_lossy().to_string(),
            "preview.png".to_string(),
            dst_path.to_string_lossy().to_string(),
        );
        assert!(result.is_ok());
        assert!(dst_path.exists());
    }

    #[test]
    fn extract_track_hero_image_fails_when_source_missing() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let dst_path = tmp_dir.path().join("output.png");

        let result = extract_track_hero_image(
            tmp_dir.path().to_string_lossy().to_string(),
            "nonexistent.png".to_string(),
            dst_path.to_string_lossy().to_string(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn preview_replacement_image_returns_data_url() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let file_path = tmp_dir.path().join("test.png");
        write_red_png(&file_path);

        let result = preview_replacement_image(file_path.to_string_lossy().to_string());
        assert!(result.is_ok());
        let url = result.unwrap();
        assert!(url.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn preview_replacement_image_fails_for_invalid_file() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let file_path = tmp_dir.path().join("not_an_image.txt");
        let mut f = std::fs::File::create(&file_path).unwrap();
        f.write_all(b"not image data").unwrap();

        let result = preview_replacement_image(file_path.to_string_lossy().to_string());
        assert!(result.is_err());
    }
}
