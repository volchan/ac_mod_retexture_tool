use std::path::PathBuf;

use base64::engine::general_purpose;
use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::errors::AppError;

const EDITS_DIR: &str = "livery_edits";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveryEditSave {
    /// Stable across sessions, unlike the texture id the decoder hands out.
    pub texture_key: String,
    /// Flattened PNG the editor produced, without its `data:` prefix.
    pub png_base64: String,
    /// Layer stack, kept so reopening the editor resumes where it left off.
    pub document_json: String,
}

/// Writes an edited texture to the app's own data directory. The edit never lands
/// in the Assetto Corsa install: it becomes a replacement the export pipeline
/// picks up like any imported PNG.
#[tauri::command]
pub async fn save_livery_edit(app: AppHandle, opts: LiveryEditSave) -> Result<String, String> {
    save_livery_edit_inner(&app, &opts).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_livery_document(
    app: AppHandle,
    texture_key: String,
) -> Result<Option<String>, String> {
    let dir = edits_dir(&app).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", sanitize(&texture_key)));
    Ok(std::fs::read_to_string(path).ok())
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

fn save_livery_edit_inner(app: &AppHandle, opts: &LiveryEditSave) -> Result<String, AppError> {
    let dir = edits_dir(app)?;
    std::fs::create_dir_all(&dir)?;

    let stem = sanitize(&opts.texture_key);
    let png_path = dir.join(format!("{stem}.png"));

    let bytes = general_purpose::STANDARD
        .decode(strip_data_url(&opts.png_base64))
        .map_err(|e| AppError::ImageDecode(e.to_string()))?;
    std::fs::write(&png_path, bytes)?;
    std::fs::write(dir.join(format!("{stem}.json")), &opts.document_json)?;

    Ok(png_path.to_string_lossy().to_string())
}

fn edits_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::NotFound(format!("No app data directory: {e}")))?;
    Ok(base.join(EDITS_DIR))
}

/// Texture keys carry path separators and extensions, none of which survive as a
/// filename, so everything outside a safe alphabet collapses to an underscore.
/// Builds the stem the edit's PNG and document share. The readable part is only
/// there to make the folder browsable: two texture keys that differ solely by
/// punctuation collapse onto the same characters, so the digest of the full key
/// is what actually keeps them apart.
fn sanitize(key: &str) -> String {
    let readable: String = key
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    format!("{readable}_{:016x}", digest(key))
}

/// FNV-1a. Hand-rolled because the stem lands in a filename that must still match
/// after a toolchain upgrade, and `DefaultHasher` makes no such promise.
fn digest(key: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in key.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn strip_data_url(value: &str) -> &str {
    match value.split_once(",") {
        Some((prefix, rest)) if prefix.starts_with("data:") => rest,
        _ => value,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_replaces_path_separators_and_dots() {
        assert!(sanitize("skins/red_01/livery.png").starts_with("skins_red_01_livery_png_"));
    }

    #[test]
    fn sanitize_keeps_alphanumerics() {
        assert!(sanitize("abc123").starts_with("abc123_"));
    }

    #[test]
    fn sanitize_separates_keys_that_differ_only_by_punctuation() {
        assert_ne!(sanitize("foo-bar.dds"), sanitize("foo_bar.dds"));
    }

    #[test]
    fn sanitize_is_stable_for_the_same_key() {
        assert_eq!(
            sanitize("skins/red_01/body.dds"),
            sanitize("skins/red_01/body.dds")
        );
    }

    #[test]
    fn strip_data_url_removes_the_mime_prefix() {
        assert_eq!(strip_data_url("data:image/png;base64,AAAB"), "AAAB");
    }

    #[test]
    fn strip_data_url_leaves_bare_base64_alone() {
        assert_eq!(strip_data_url("AAAB"), "AAAB");
    }

    #[test]
    fn strip_data_url_leaves_a_comma_in_bare_base64_alone() {
        assert_eq!(strip_data_url("AA,AB"), "AA,AB");
    }
}
