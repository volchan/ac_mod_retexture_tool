use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::commands::repack::encode_replacement;
use crate::commands::skin::write_skin_meta;
use crate::commands::test_in_game::{ac_documents_cfg, build_race_ini, DirGuard, RaceIniGuard};
use crate::errors::AppError;
use crate::models::repack::TextureReplacementOpt;
use crate::models::skin::SkinMeta;

/// Suffix that marks the throwaway skin the toolkit installs to drive a preview,
/// so it is never mistaken for one the author keeps.
const PREVIEW_SUFFIX: &str = "__toolkit_preview";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinTestOptions {
    pub ac_path: String,
    /// `content/cars/<car_id>` the skin belongs to.
    pub car_path: String,
    pub skin_folder: String,
    pub track_id: String,
    pub config_track: String,
    pub meta: SkinMeta,
    pub replacements: Vec<TextureReplacementOpt>,
}

/// Drives the edited skin in Assetto Corsa without disturbing the skin it was
/// opened from: the edits land in a throwaway folder next to it, which is
/// deleted once the game exits.
#[tauri::command]
pub async fn test_skin_in_game(opts: SkinTestOptions) -> Result<(), String> {
    tokio::task::spawn_blocking(move || run(&opts))
        .await
        .map_err(|e| format!("Task failed: {e}"))?
        .map_err(|e: AppError| e.to_string())
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

fn run(opts: &SkinTestOptions) -> Result<(), AppError> {
    let car_path = Path::new(&opts.car_path);
    let car_id = car_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::NotFound(format!("Invalid car path: {}", opts.car_path)))?;

    let source = car_path.join("skins").join(&opts.skin_folder);
    if !source.is_dir() {
        return Err(AppError::NotFound(format!(
            "Skin folder not found: {}",
            source.display()
        )));
    }

    let preview_skin = preview_skin_name(&opts.skin_folder);
    let preview_path = car_path.join("skins").join(&preview_skin);
    stage_preview_skin(&source, &preview_path, opts)?;
    let _skin_guard = DirGuard(preview_path);

    let ac_root = Path::new(&opts.ac_path);
    let cfg_dir = ac_documents_cfg()?;
    let race_ini = cfg_dir.join("race.ini");
    std::fs::create_dir_all(&cfg_dir)?;

    let bak = race_ini.with_extension("bak");
    let had_original = race_ini.exists();
    if had_original {
        std::fs::copy(&race_ini, &bak)?;
    }
    std::fs::write(
        &race_ini,
        build_race_ini(&opts.track_id, car_id, &preview_skin, &opts.config_track),
    )?;
    let guard = RaceIniGuard::new(race_ini, bak, had_original);

    std::process::Command::new(ac_root.join("acs.exe"))
        .current_dir(ac_root)
        .spawn()?
        .wait()?;

    guard.finish()
}

/// The preview is a full copy: a skin missing files the car expects loads wrong,
/// and this one is thrown away anyway.
fn stage_preview_skin(
    source: &Path,
    preview_path: &Path,
    opts: &SkinTestOptions,
) -> Result<(), AppError> {
    if preview_path.exists() {
        std::fs::remove_dir_all(preview_path)?;
    }
    std::fs::create_dir_all(preview_path)?;

    for entry in std::fs::read_dir(source)?.flatten() {
        let path = entry.path();
        if path.is_file() {
            std::fs::copy(&path, preview_path.join(entry.file_name()))?;
        }
    }

    for replacement in &opts.replacements {
        std::fs::write(
            preview_path.join(&replacement.texture_name),
            encode_replacement(replacement)?,
        )?;
    }

    write_skin_meta(preview_path, &opts.meta)
}

fn preview_skin_name(skin_folder: &str) -> String {
    format!("{skin_folder}{PREVIEW_SUFFIX}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta() -> SkinMeta {
        SkinMeta {
            folder_name: "super_silver".to_string(),
            skin_name: "Edited".to_string(),
            driver_name: String::new(),
            team: String::new(),
            number: String::new(),
            country: String::new(),
        }
    }

    fn options(car_path: &Path) -> SkinTestOptions {
        SkinTestOptions {
            ac_path: String::new(),
            car_path: car_path.to_string_lossy().to_string(),
            skin_folder: "super_silver".to_string(),
            track_id: "spa".to_string(),
            config_track: String::new(),
            meta: meta(),
            replacements: vec![],
        }
    }

    #[test]
    fn preview_skin_sits_beside_the_original_under_a_marked_name() {
        assert_eq!(
            preview_skin_name("super_silver"),
            "super_silver__toolkit_preview"
        );
    }

    #[test]
    fn race_ini_selects_the_preview_skin_and_the_cars_own_model() {
        let ini = build_race_ini("spa", "ks_nissan_gtr", "super_silver__toolkit_preview", "");

        assert!(ini.contains("MODEL=ks_nissan_gtr"));
        assert!(ini.contains("SKIN=super_silver__toolkit_preview"));
        assert!(ini.contains("TRACK=spa"));
    }

    #[test]
    fn staging_copies_the_whole_skin_and_leaves_the_original_alone() {
        let root = tempfile::tempdir().unwrap();
        let car = root.path().join("ks_nissan_gtr");
        let source = car.join("skins/super_silver");
        std::fs::create_dir_all(&source).unwrap();
        for f in ["body.dds", "led_strip_1.kn5", "ui_skin.json"] {
            std::fs::write(source.join(f), b"original").unwrap();
        }

        let preview = car.join("skins/super_silver__toolkit_preview");
        stage_preview_skin(&source, &preview, &options(&car)).unwrap();

        assert!(preview.join("body.dds").exists());
        assert!(preview.join("led_strip_1.kn5").exists());
        assert_eq!(
            std::fs::read(source.join("body.dds")).unwrap(),
            b"original".to_vec()
        );
        let written = std::fs::read_to_string(source.join("ui_skin.json")).unwrap();
        assert_eq!(written, "original");
    }

    #[test]
    fn the_preview_skin_is_removed_when_the_guard_drops() {
        let root = tempfile::tempdir().unwrap();
        let preview = root.path().join("skins/super_silver__toolkit_preview");
        std::fs::create_dir_all(&preview).unwrap();
        std::fs::write(preview.join("body.dds"), b"data").unwrap();

        {
            let _guard = DirGuard(preview.clone());
            assert!(preview.exists());
        }

        assert!(!preview.exists());
    }
}
