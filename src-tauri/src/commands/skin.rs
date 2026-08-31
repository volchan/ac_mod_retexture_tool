use std::path::{Path, PathBuf};

use base64::engine::general_purpose;
use base64::Engine;
use serde_json::Value;

use crate::commands::track_hero::mime_for_path;
use crate::models::skin::SkinEntry;

const SKINS_DIR: &str = "skins";
const UI_SKIN_JSON: &str = "ui_skin.json";
const TEXTURE_EXT: &str = "dds";
const MAX_PREVIEW_BYTES: u64 = 10 * 1024 * 1024;

// AC skin previews are usually JPEG, sometimes with no extension at all.
const PREVIEW_CANDIDATES: &[&str] = &["preview.jpg", "preview.png", "preview.jpeg", "preview"];

/// Lists every skin folder of an installed car, newest metadata first.
///
/// Returns an empty list rather than an error when the car has no `skins/`
/// directory — a car without skins is unusual but not broken.
#[tauri::command]
pub async fn list_car_skins(car_path: String) -> Result<Vec<SkinEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let skins_dir = Path::new(&car_path).join(SKINS_DIR);
        if !skins_dir.is_dir() {
            return Ok(vec![]);
        }

        let mut dirs: Vec<PathBuf> = std::fs::read_dir(&skins_dir)
            .map_err(|e| format!("Cannot read skins folder: {e}"))?
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        dirs.sort();

        Ok(dirs.iter().map(|p| build_skin_entry(p)).collect())
    })
    .await
    .map_err(|e| format!("Task failed: {e}"))?
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

fn build_skin_entry(skin_path: &Path) -> SkinEntry {
    let name = skin_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();

    let json = read_ui_skin(skin_path);

    SkinEntry {
        name,
        path: skin_path.to_string_lossy().to_string(),
        display_name: string_field(&json, "skinname"),
        driver_name: string_field(&json, "drivername"),
        team: string_field(&json, "team"),
        number: number_field(&json, "number"),
        preview_url: read_preview_data_url(skin_path),
        texture_count: count_dds_files(skin_path),
    }
}

fn read_ui_skin(skin_path: &Path) -> Value {
    std::fs::read_to_string(skin_path.join(UI_SKIN_JSON))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null)
}

fn string_field(json: &Value, key: &str) -> Option<String> {
    json.get(key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
}

/// `number` is quoted in some skins and a bare integer in others.
fn number_field(json: &Value, key: &str) -> Option<String> {
    let value = json.get(key)?;
    match value {
        Value::String(s) if !s.trim().is_empty() => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn read_preview_data_url(skin_path: &Path) -> Option<String> {
    let preview = PREVIEW_CANDIDATES
        .iter()
        .map(|name| skin_path.join(name))
        .find(|p| p.is_file())?;

    let size = std::fs::metadata(&preview).ok()?.len();
    if size > MAX_PREVIEW_BYTES {
        return None;
    }

    let bytes = std::fs::read(&preview).ok()?;
    let mime = mime_for_path(&preview.to_string_lossy());
    let b64 = general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{mime};base64,{b64}"))
}

fn count_dds_files(skin_path: &Path) -> usize {
    std::fs::read_dir(skin_path)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| {
                    e.path()
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .is_some_and(|ext| ext.eq_ignore_ascii_case(TEXTURE_EXT))
                })
                .count()
        })
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use super::*;

    fn car_with_skin(dir: &TempDir, skin: &str) -> PathBuf {
        let skin_path = dir.path().join(SKINS_DIR).join(skin);
        fs::create_dir_all(&skin_path).unwrap();
        skin_path
    }

    async fn list(dir: &TempDir) -> Vec<SkinEntry> {
        list_car_skins(dir.path().to_string_lossy().to_string())
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn returns_empty_when_car_has_no_skins_dir() {
        let dir = TempDir::new().unwrap();
        assert!(list(&dir).await.is_empty());
    }

    #[tokio::test]
    async fn lists_skin_folders_sorted_by_name() {
        let dir = TempDir::new().unwrap();
        car_with_skin(&dir, "zebra");
        car_with_skin(&dir, "alpha");
        car_with_skin(&dir, "monza");

        let names: Vec<String> = list(&dir).await.into_iter().map(|s| s.name).collect();
        assert_eq!(names, vec!["alpha", "monza", "zebra"]);
    }

    #[tokio::test]
    async fn ignores_loose_files_next_to_skin_folders() {
        let dir = TempDir::new().unwrap();
        car_with_skin(&dir, "red_01");
        fs::write(dir.path().join(SKINS_DIR).join("readme.txt"), b"nope").unwrap();

        let skins = list(&dir).await;
        assert_eq!(skins.len(), 1);
        assert_eq!(skins[0].name, "red_01");
    }

    #[tokio::test]
    async fn reads_ui_skin_metadata() {
        let dir = TempDir::new().unwrap();
        let skin = car_with_skin(&dir, "red_01");
        fs::write(
            skin.join(UI_SKIN_JSON),
            r#"{"skinname":"Rosso Corsa","drivername":"A Driver","team":"A Team","number":"27"}"#,
        )
        .unwrap();

        let skins = list(&dir).await;
        assert_eq!(skins[0].display_name.as_deref(), Some("Rosso Corsa"));
        assert_eq!(skins[0].driver_name.as_deref(), Some("A Driver"));
        assert_eq!(skins[0].team.as_deref(), Some("A Team"));
        assert_eq!(skins[0].number.as_deref(), Some("27"));
    }

    #[tokio::test]
    async fn accepts_numeric_and_blank_number_field() {
        let dir = TempDir::new().unwrap();
        let numeric = car_with_skin(&dir, "a_numeric");
        fs::write(numeric.join(UI_SKIN_JSON), r#"{"number":27}"#).unwrap();
        let blank = car_with_skin(&dir, "b_blank");
        fs::write(blank.join(UI_SKIN_JSON), r#"{"number":"  ","skinname":""}"#).unwrap();

        let skins = list(&dir).await;
        assert_eq!(skins[0].number.as_deref(), Some("27"));
        assert_eq!(skins[1].number, None);
        assert_eq!(skins[1].display_name, None);
    }

    #[tokio::test]
    async fn missing_or_malformed_ui_skin_leaves_metadata_empty() {
        let dir = TempDir::new().unwrap();
        car_with_skin(&dir, "a_missing");
        let broken = car_with_skin(&dir, "b_broken");
        fs::write(broken.join(UI_SKIN_JSON), b"{not json").unwrap();

        let skins = list(&dir).await;
        for skin in &skins {
            assert_eq!(skin.display_name, None);
            assert_eq!(skin.driver_name, None);
        }
    }

    #[tokio::test]
    async fn reads_preview_as_data_url_including_extensionless() {
        let dir = TempDir::new().unwrap();
        let jpg = car_with_skin(&dir, "a_jpg");
        fs::write(jpg.join("preview.jpg"), b"jpegbytes").unwrap();
        let png = car_with_skin(&dir, "b_png");
        fs::write(png.join("preview.png"), b"pngbytes").unwrap();
        let bare = car_with_skin(&dir, "c_bare");
        fs::write(bare.join("preview"), b"jpegbytes").unwrap();
        car_with_skin(&dir, "d_none");

        let skins = list(&dir).await;
        assert!(skins[0]
            .preview_url
            .as_ref()
            .unwrap()
            .starts_with("data:image/jpeg;base64,"));
        assert!(skins[1]
            .preview_url
            .as_ref()
            .unwrap()
            .starts_with("data:image/png;base64,"));
        assert!(skins[2]
            .preview_url
            .as_ref()
            .unwrap()
            .starts_with("data:image/jpeg;base64,"));
        assert_eq!(skins[3].preview_url, None);
    }

    #[tokio::test]
    async fn counts_dds_textures_case_insensitively() {
        let dir = TempDir::new().unwrap();
        let skin = car_with_skin(&dir, "red_01");
        fs::write(skin.join("livery.dds"), b"a").unwrap();
        fs::write(skin.join("Interior.DDS"), b"b").unwrap();
        fs::write(skin.join("preview.jpg"), b"c").unwrap();
        fs::write(skin.join(UI_SKIN_JSON), b"{}").unwrap();

        assert_eq!(list(&dir).await[0].texture_count, 2);
    }

    #[tokio::test]
    async fn skips_preview_larger_than_the_cap() {
        let dir = TempDir::new().unwrap();
        let skin = car_with_skin(&dir, "huge");
        fs::write(
            skin.join("preview.jpg"),
            vec![0u8; MAX_PREVIEW_BYTES as usize + 1],
        )
        .unwrap();

        assert_eq!(list(&dir).await[0].preview_url, None);
    }
}
