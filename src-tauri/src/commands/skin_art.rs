//! The two images AC shows for a skin without ever opening its textures: the
//! `preview.jpg` on the car selection screen and the `livery.png` badge in the
//! entry list. Both are drawn in the webview, so this side only decides where
//! the bytes may land and refuses everything else.

use std::path::{Path, PathBuf};

use base64::engine::general_purpose;
use base64::Engine;

use crate::commands::skin::{ensure_safe_folder_name, MAX_SKIN_ART_BYTES, SKINS_DIR};
use crate::errors::AppError;

/// Which image is being written. An enum rather than a file name: the caller is
/// the webview, and a name from there would choose any file in the skin folder.
#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SkinArt {
    Preview,
    Livery,
}

impl SkinArt {
    fn file_name(self) -> &'static str {
        match self {
            Self::Preview => "preview.jpg",
            Self::Livery => "livery.png",
        }
    }
}

/// Writes one of a skin's two display images, replacing whatever is there.
///
/// `payload` is bare base64 — no data URL prefix — as the canvas hands it over.
#[tauri::command]
pub async fn write_skin_art(
    car_path: String,
    skin: String,
    art: SkinArt,
    payload: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let written = write_art(Path::new(&car_path), &skin, art, &payload)?;
        Ok::<String, AppError>(written.display().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

fn write_art(car: &Path, skin: &str, art: SkinArt, payload: &str) -> Result<PathBuf, AppError> {
    ensure_safe_folder_name(skin)?;

    let bytes = general_purpose::STANDARD
        .decode(payload)
        .map_err(|e| AppError::InvalidInput(format!("skin art is not base64: {e}")))?;

    // The payload crosses IPC as a string, so its size is whatever the webview
    // sent; a badge is a few KB and a preview a hundred.
    if bytes.len() as u64 > MAX_SKIN_ART_BYTES {
        return Err(AppError::InvalidInput(format!(
            "skin art too large: {} bytes",
            bytes.len()
        )));
    }

    let skin_dir = car.join(SKINS_DIR).join(skin);
    if !skin_dir.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "no such skin folder: {}",
            skin_dir.display()
        )));
    }

    let path = skin_dir.join(art.file_name());
    std::fs::write(&path, bytes)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn car_with_skin(skin: &str) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(SKINS_DIR).join(skin)).unwrap();
        dir
    }

    fn encoded(bytes: &[u8]) -> String {
        general_purpose::STANDARD.encode(bytes)
    }

    #[test]
    fn a_preview_lands_under_the_name_ac_looks_for() {
        let car = car_with_skin("racing_blue");

        let written = write_art(
            car.path(),
            "racing_blue",
            SkinArt::Preview,
            &encoded(b"jpeg"),
        )
        .unwrap();

        assert!(written.ends_with("preview.jpg"));
        assert_eq!(std::fs::read(&written).unwrap(), b"jpeg");
    }

    #[test]
    fn a_badge_lands_under_its_own_name() {
        let car = car_with_skin("racing_blue");

        let written =
            write_art(car.path(), "racing_blue", SkinArt::Livery, &encoded(b"png")).unwrap();

        assert!(written.ends_with("livery.png"));
    }

    #[test]
    fn writing_again_replaces_the_previous_image() {
        let car = car_with_skin("racing_blue");
        write_art(car.path(), "racing_blue", SkinArt::Livery, &encoded(b"old")).unwrap();

        let written =
            write_art(car.path(), "racing_blue", SkinArt::Livery, &encoded(b"new")).unwrap();

        assert_eq!(std::fs::read(&written).unwrap(), b"new");
    }

    /// The skin name arrives over IPC, and the two file names are the only
    /// things standing between it and any file the process can write.
    #[test]
    fn a_skin_name_that_is_a_path_is_refused() {
        let car = car_with_skin("racing_blue");

        for name in ["../../etc", "racing/blue", ".."] {
            assert!(
                write_art(car.path(), name, SkinArt::Livery, &encoded(b"png")).is_err(),
                "{name}"
            );
        }
    }

    #[test]
    fn a_skin_folder_that_does_not_exist_is_refused() {
        let car = car_with_skin("racing_blue");

        let result = write_art(car.path(), "absent", SkinArt::Livery, &encoded(b"png"));

        assert!(result.is_err());
    }

    #[test]
    fn a_payload_that_is_not_base64_is_refused() {
        let car = car_with_skin("racing_blue");

        let result = write_art(car.path(), "racing_blue", SkinArt::Livery, "not base64!!");

        assert!(result.is_err());
    }

    #[test]
    fn a_payload_past_the_size_cap_is_refused() {
        let car = car_with_skin("racing_blue");
        let huge = encoded(&vec![0u8; MAX_SKIN_ART_BYTES as usize + 1]);

        let result = write_art(car.path(), "racing_blue", SkinArt::Livery, &huge);

        assert!(result.is_err());
        assert!(!car
            .path()
            .join(SKINS_DIR)
            .join("racing_blue/livery.png")
            .exists());
    }
}
