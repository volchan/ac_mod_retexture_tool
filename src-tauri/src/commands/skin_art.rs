//! The two images AC shows for a skin without ever opening its textures: the
//! `preview.jpg` on the car selection screen and the `livery.png` badge in the
//! entry list. Both are drawn in the webview, so this side only decides where
//! the bytes may land and refuses everything else.

use std::path::{Path, PathBuf};

use base64::engine::general_purpose;
use base64::Engine;

use crate::commands::image_source::ensure_readable_image;
use crate::commands::skin::{ensure_safe_folder_name, MAX_SKIN_ART_BYTES, SKINS_DIR};
use crate::converters::dds::decode_to_image;
use crate::converters::dominant::dominant_colours;
use crate::errors::AppError;
use crate::parsers::kn5::Kn5File;

/// Which image is being written. An enum rather than a file name: the caller is
/// the webview, and a name from there would choose any file in the skin folder.
#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SkinArt {
    Preview,
    Livery,
}

impl SkinArt {
    pub(crate) fn file_name(self) -> &'static str {
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

/// Where a texture's bytes are. A car keeps most of its textures inside the KN5
/// and only the painted ones as files, so a path on disk answers for some of
/// them and nothing at all for the rest.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum TextureBytes {
    File { path: String },
    Embedded { kn5: String, name: String },
}

/// The colours a texture wears, most-worn first, for the badge to be painted in.
///
/// Counted here rather than in the webview because this is where the pixels
/// already are: what crosses the IPC boundary is a 128 pixel thumbnail, and a
/// 7168 wide sheet reduced that far blends every stripe into its neighbour.
#[tauri::command]
pub async fn sample_texture_colours(
    texture: TextureBytes,
    wanted: u32,
) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let image = decode_to_image(&texture_bytes(&texture)?)?;
        Ok::<Vec<String>, AppError>(dominant_colours(&image, wanted as usize))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// Every read here names the file it failed on. A bare "No such file or
/// directory" says nothing about which of a car's sixty textures went missing,
/// and the answer is the whole diagnosis.
pub(crate) fn texture_bytes(texture: &TextureBytes) -> Result<Vec<u8>, AppError> {
    match texture {
        TextureBytes::File { path } => {
            let path = Path::new(path);
            ensure_readable_image(path)?;
            std::fs::read(path)
                .map_err(|e| AppError::InvalidInput(format!("cannot read {}: {e}", path.display())))
        }
        TextureBytes::Embedded { kn5, name } => {
            let kn5_path = Path::new(kn5);
            let file = Kn5File::open(kn5_path).map_err(|e| {
                AppError::InvalidInput(format!("cannot read {}: {e}", kn5_path.display()))
            })?;

            file.get_texture_data(name)
                .map(<[u8]>::to_vec)
                .ok_or_else(|| {
                    AppError::InvalidInput(format!(
                        "{} holds no texture {name}",
                        kn5_path.display()
                    ))
                })
        }
    }
}

fn write_art(car: &Path, skin: &str, art: SkinArt, payload: &str) -> Result<PathBuf, AppError> {
    ensure_safe_folder_name(skin)?;
    let bytes = decode_art(payload)?;

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

/// The bytes behind a skin image the webview handed over as bare base64.
///
/// The payload crosses IPC as a string, so its size is whatever the webview
/// sent; a badge is a few KB and a preview a hundred.
pub(crate) fn decode_art(payload: &str) -> Result<Vec<u8>, AppError> {
    let bytes = general_purpose::STANDARD
        .decode(payload)
        .map_err(|e| AppError::InvalidInput(format!("skin art is not base64: {e}")))?;

    if bytes.len() as u64 > MAX_SKIN_ART_BYTES {
        return Err(AppError::InvalidInput(format!(
            "skin art too large: {} bytes",
            bytes.len()
        )));
    }
    Ok(bytes)
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

    /// A bare "No such file or directory" says nothing about which of a car's
    /// sixty textures went missing, and the answer is the whole diagnosis.
    #[test]
    fn a_texture_that_is_not_there_is_named_in_the_error() {
        let missing = TextureBytes::File {
            path: "/cars/gtm/skins/blue/body.dds".to_string(),
        };

        let Err(err) = texture_bytes(&missing) else {
            panic!("a missing file must be refused");
        };
        assert!(err.to_string().contains("body.dds"), "got {err}");
    }

    #[test]
    fn a_file_that_is_not_an_image_is_refused_before_it_is_read() {
        let kn5 = TextureBytes::File {
            path: "/cars/gtm/gtm.kn5".to_string(),
        };

        assert!(texture_bytes(&kn5).is_err());
    }

    /// A stock Kunos car keeps every texture inside its KN5, so the model can
    /// name one that no file on disk answers for.
    #[test]
    fn a_kn5_that_is_not_there_is_named_too() {
        let embedded = TextureBytes::Embedded {
            kn5: "/cars/ks_ferrari_f40/f40.kn5".to_string(),
            name: "f40_body.dds".to_string(),
        };

        let Err(err) = texture_bytes(&embedded) else {
            panic!("a missing kn5 must be refused");
        };
        assert!(err.to_string().contains("f40.kn5"), "got {err}");
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
