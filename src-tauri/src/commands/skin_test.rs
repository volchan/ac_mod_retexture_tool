use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::commands::repack::{copy_dir_recursive, write_replacement};
use crate::commands::skin::{ensure_safe_folder_name, write_skin_meta};
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
    ensure_safe_folder_name(&opts.skin_folder)?;

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
    let _skin_guard = stage_with_guard(&source, &preview_path, opts)?;

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

/// Stages the throwaway skin and hands back the guard that removes it.
///
/// The guard is armed before the copy rather than after it: staging writes a
/// folder, a tree of files and every queued replacement, and a failure at any
/// of those left the half-written preview sitting in the car's skins folder,
/// where the next run refuses to start.
fn stage_with_guard(
    source: &Path,
    preview_path: &Path,
    opts: &SkinTestOptions,
) -> Result<DirGuard, AppError> {
    // Whatever sits here was not put there by this run, and the guard deletes the
    // folder afterwards: wiping it first would destroy an author's own work that
    // happens to carry the same suffix, or a leftover this tool failed to clean.
    if preview_path.exists() {
        return Err(AppError::InvalidInput(format!(
            "{} already exists — delete it and start the test again",
            preview_path.display()
        )));
    }

    let guard = DirGuard(preview_path.to_path_buf());
    stage_preview_skin(source, preview_path, opts)?;
    Ok(guard)
}

/// The preview is a full copy, sub-folders included: a skin missing files the car
/// expects loads wrong, and this one is thrown away anyway.
fn stage_preview_skin(
    source: &Path,
    preview_path: &Path,
    opts: &SkinTestOptions,
) -> Result<(), AppError> {
    copy_dir_recursive(source, preview_path)?;

    for replacement in &opts.replacements {
        write_replacement(preview_path, replacement)?;
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
    fn staging_copies_nested_skin_assets_too() {
        let root = tempfile::tempdir().unwrap();
        let car = root.path().join("ks_nissan_gtr");
        let source = car.join("skins/super_silver");
        std::fs::create_dir_all(source.join("extension")).unwrap();
        std::fs::write(source.join("body.dds"), b"a").unwrap();
        std::fs::write(source.join("extension/ext_config.ini"), b"b").unwrap();

        let preview = car.join("skins/super_silver__toolkit_preview");
        stage_preview_skin(&source, &preview, &options(&car)).unwrap();

        assert!(preview.join("extension/ext_config.ini").exists());
    }

    #[test]
    fn staging_refuses_to_overwrite_a_folder_it_did_not_create() {
        let root = tempfile::tempdir().unwrap();
        let car = root.path().join("ks_nissan_gtr");
        let source = car.join("skins/super_silver");
        std::fs::create_dir_all(&source).unwrap();
        let preview = car.join("skins/super_silver__toolkit_preview");
        std::fs::create_dir_all(&preview).unwrap();
        std::fs::write(preview.join("precious.dds"), b"keep me").unwrap();

        let result = stage_with_guard(&source, &preview, &options(&car));

        assert!(result.is_err());
        assert_eq!(
            std::fs::read(preview.join("precious.dds")).unwrap(),
            b"keep me".to_vec()
        );
    }

    /// Guard ordering: staging can fail after the copy has already written the
    /// folder, and the half-staged preview blocks every later run.
    #[test]
    fn a_failed_staging_takes_the_half_written_preview_with_it() {
        let root = tempfile::tempdir().unwrap();
        let car = root.path().join("ks_nissan_gtr");
        let source = car.join("skins/super_silver");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("body.dds"), b"original").unwrap();

        let mut opts = options(&car);
        opts.replacements = vec![TextureReplacementOpt {
            texture_id: "tex".to_string(),
            source_path: source.join("body.dds").to_string_lossy().to_string(),
            kn5_file: None,
            texture_name: "../escaped.dds".to_string(),
            skin_folder: Some("super_silver".to_string()),
            original_format: "PNG".to_string(),
            hero_image_path: None,
        }];

        let preview = car.join("skins/super_silver__toolkit_preview");
        assert!(stage_with_guard(&source, &preview, &opts).is_err());
        assert!(!preview.exists(), "the staged folder must not survive");
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
