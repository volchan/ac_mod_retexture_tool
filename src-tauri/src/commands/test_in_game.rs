use std::collections::HashMap;
use std::path::Path;

use crate::commands::repack::patch_kn5;
use crate::converters::dds;
use crate::errors::AppError;
use crate::models::repack::TextureReplacementOpt;

#[tauri::command]
pub async fn list_track_layouts(mod_path: String) -> Result<Vec<String>, String> {
    let ui_dir = Path::new(&mod_path).join("ui");
    if !ui_dir.is_dir() {
        return Ok(vec![]);
    }
    let mut names: Vec<String> = std::fs::read_dir(&ui_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|name| ui_dir.join(name).join("ui_track.json").exists())
        .collect();
    names.sort();
    Ok(names)
}

#[tauri::command]
pub async fn test_in_game(
    ac_path: String,
    mod_path: String,
    car_id: String,
    config_track: String,
    replacements: Vec<TextureReplacementOpt>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        run(&ac_path, &mod_path, &car_id, &config_track, &replacements)
    })
    .await
    .map_err(|e| format!("Task failed: {e}"))?
    .map_err(|e: AppError| e.to_string())
}

fn ac_documents_cfg() -> Result<std::path::PathBuf, AppError> {
    // AC reads race.ini from Documents\Assetto Corsa\cfg, not the Steam install folder
    let docs = dirs::document_dir()
        .ok_or_else(|| AppError::NotFound("Cannot locate Documents folder".to_string()))?;
    Ok(docs.join("Assetto Corsa").join("cfg"))
}

struct DirGuard(std::path::PathBuf);

impl Drop for DirGuard {
    fn drop(&mut self) {
        if self.0.exists() {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
}

fn restore_race_ini(race_ini: &Path, bak: &Path, had_original: bool) -> Result<(), AppError> {
    if had_original {
        std::fs::rename(bak, race_ini)?;
    } else {
        if race_ini.exists() {
            std::fs::remove_file(race_ini)?;
        }
        let _ = std::fs::remove_file(bak);
    }
    Ok(())
}

struct RaceIniGuard {
    race_ini: std::path::PathBuf,
    bak: std::path::PathBuf,
    had_original: bool,
    finished: bool,
}

impl RaceIniGuard {
    fn new(race_ini: std::path::PathBuf, bak: std::path::PathBuf, had_original: bool) -> Self {
        Self {
            race_ini,
            bak,
            had_original,
            finished: false,
        }
    }

    fn finish(mut self) -> Result<(), AppError> {
        self.finished = true;
        restore_race_ini(&self.race_ini, &self.bak, self.had_original)
    }
}

impl Drop for RaceIniGuard {
    fn drop(&mut self) {
        if !self.finished {
            let _ = restore_race_ini(&self.race_ini, &self.bak, self.had_original);
        }
    }
}

fn run(
    ac_path: &str,
    mod_path: &str,
    car_id: &str,
    config_track: &str,
    replacements: &[TextureReplacementOpt],
) -> Result<(), AppError> {
    let ac_root = Path::new(ac_path);
    let mod_root = Path::new(mod_path);

    let folder_name = mod_root
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::NotFound("Invalid mod path".to_string()))?;
    let preview_name = format!("{folder_name}_preview");

    let preview_path = ac_root.join("content/tracks").join(&preview_name);
    let cfg_dir = ac_documents_cfg()?;
    let race_ini_path = cfg_dir.join("race.ini");
    let acs_exe = ac_root.join("acs.exe");

    copy_dir_all(mod_root, &preview_path)?;
    // Drop guard ensures cleanup even on panic or early return
    let _preview_guard = DirGuard(preview_path.clone());

    run_session(
        &preview_path,
        replacements,
        &cfg_dir,
        &race_ini_path,
        &acs_exe,
        ac_root,
        &preview_name,
        car_id,
        config_track,
    )
}

#[allow(clippy::too_many_arguments)]
fn run_session(
    preview_path: &Path,
    replacements: &[TextureReplacementOpt],
    cfg_dir: &Path,
    race_ini_path: &Path,
    acs_exe: &Path,
    ac_root: &Path,
    preview_name: &str,
    car_id: &str,
    config_track: &str,
) -> Result<(), AppError> {
    apply_replacements(preview_path, replacements)?;

    std::fs::create_dir_all(cfg_dir)?;

    // Write backup to disk so it survives a Tauri process crash while AC is running
    let bak_path = race_ini_path.with_extension("bak");
    let had_original = race_ini_path.exists();
    if had_original {
        std::fs::copy(race_ini_path, &bak_path)?;
    }

    std::fs::write(race_ini_path, build_race_ini(preview_name, car_id, config_track))?;

    let guard = RaceIniGuard::new(race_ini_path.to_path_buf(), bak_path, had_original);

    let _status = std::process::Command::new(acs_exe)
        .current_dir(ac_root)
        .spawn()?
        .wait()?;

    guard.finish()
}

fn apply_replacements(
    preview_root: &Path,
    replacements: &[TextureReplacementOpt],
) -> Result<(), AppError> {
    let mut kn5_groups: HashMap<String, Vec<&TextureReplacementOpt>> = HashMap::new();
    for r in replacements {
        if let Some(kn5) = &r.kn5_file {
            kn5_groups.entry(kn5.clone()).or_default().push(r);
        }
    }

    for (original_kn5_path, group) in &kn5_groups {
        let kn5_filename = Path::new(original_kn5_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let preview_kn5 = walkdir::WalkDir::new(preview_root)
            .into_iter()
            .filter_map(|e| e.ok())
            .find(|e| {
                e.file_type().is_file()
                    && e.file_name()
                        .to_string_lossy()
                        .eq_ignore_ascii_case(&kn5_filename)
            })
            .map(|e| e.path().to_path_buf())
            .ok_or_else(|| {
                AppError::NotFound(format!("KN5 not found in preview folder: {kn5_filename}"))
            })?;
        patch_kn5(&preview_kn5, group)?;
    }

    for r in replacements {
        if let Some(skin_folder) = &r.skin_folder {
            let dst = preview_root
                .join("skins")
                .join(skin_folder)
                .join(&r.texture_name);
            let png_data = std::fs::read(&r.source_path)?;
            let img = image::load_from_memory(&png_data)
                .map_err(|e| AppError::ImageDecode(e.to_string()))?;
            let dds_data = dds::encode_from_image(&img, &r.original_format)?;
            std::fs::write(&dst, dds_data)?;
        }
    }

    for r in replacements {
        if let Some(hero_path) = &r.hero_image_path {
            let dst = preview_root.join(hero_path);
            if let Some(parent) = dst.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&r.source_path, &dst)?;
        }
    }

    Ok(())
}

fn build_race_ini(track: &str, car: &str, config_track: &str) -> String {
    format!(
        "[HEADER]\nVERSION=2\n\n[RACE]\nMODEL={car}\nSKIN=default\nTRACK={track}\nCONFIG_TRACK={config_track}\nAI_LEVEL=95\nFIXED_SETUP=0\nRANDOM_SETUP=0\nPENALTIES=1\nJUMP_START_PENALTY=0\n\n[SESSION_0]\nNAME=Free Practice\nTYPE=1\nDURATION_MINUTES=0\nLAPS=0\nWAIT_TIME=60\nSPAWN_SET=PIT\n\n[LAP_INVALIDATOR]\nALLOWED_TYRES_OUT=-1\n"
    )
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn build_race_ini_contains_track_and_car() {
        let ini = build_race_ini("my_track_preview", "ks_abarth500", "");
        assert!(ini.contains("TRACK=my_track_preview"));
        assert!(ini.contains("MODEL=ks_abarth500"));
        assert!(ini.contains("CONFIG_TRACK=\n"));
        assert!(ini.contains("TYPE=1"));
        assert!(ini.contains("SPAWN_SET=PIT"));
    }

    #[test]
    fn build_race_ini_sets_config_track_when_layout_name_given() {
        let ini = build_race_ini("my_track_preview", "ks_abarth500", "international");
        assert!(ini.contains("CONFIG_TRACK=international\n"));
    }

    #[test]
    fn list_track_layouts_returns_empty_when_no_ui_dir() {
        let tmp = TempDir::new().unwrap();
        let result = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(list_track_layouts(tmp.path().to_str().unwrap().to_string()))
            .unwrap();
        assert_eq!(result, Vec::<String>::new());
    }

    #[test]
    fn list_track_layouts_returns_sorted_names_for_subdirs_with_ui_track_json() {
        let tmp = TempDir::new().unwrap();
        let ui = tmp.path().join("ui");
        fs::create_dir_all(ui.join("gp")).unwrap();
        fs::write(ui.join("gp/ui_track.json"), b"{}").unwrap();
        fs::create_dir_all(ui.join("national")).unwrap();
        fs::write(ui.join("national/ui_track.json"), b"{}").unwrap();
        fs::create_dir_all(ui.join("international")).unwrap();
        fs::write(ui.join("international/ui_track.json"), b"{}").unwrap();
        let result = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(list_track_layouts(tmp.path().to_str().unwrap().to_string()))
            .unwrap();
        assert_eq!(result, vec!["gp", "international", "national"]);
    }

    #[test]
    fn list_track_layouts_excludes_subdirs_without_ui_track_json() {
        let tmp = TempDir::new().unwrap();
        let ui = tmp.path().join("ui");
        fs::create_dir_all(ui.join("gp")).unwrap();
        fs::write(ui.join("gp/ui_track.json"), b"{}").unwrap();
        // dir without ui_track.json should be ignored
        fs::create_dir_all(ui.join("extra")).unwrap();
        let result = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(list_track_layouts(tmp.path().to_str().unwrap().to_string()))
            .unwrap();
        assert_eq!(result, vec!["gp"]);
    }

    #[test]
    fn list_track_layouts_returns_empty_for_single_layout_track() {
        let tmp = TempDir::new().unwrap();
        // Single-layout track: ui/ui_track.json at root, no subdirs with ui_track.json
        let ui = tmp.path().join("ui");
        fs::create_dir_all(&ui).unwrap();
        fs::write(ui.join("ui_track.json"), b"{}").unwrap();
        let result = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(list_track_layouts(tmp.path().to_str().unwrap().to_string()))
            .unwrap();
        assert_eq!(result, Vec::<String>::new());
    }

    #[test]
    fn copy_dir_all_copies_nested_structure() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("src");
        let dst = tmp.path().join("dst");

        fs::create_dir_all(src.join("sub")).unwrap();
        fs::write(src.join("file.txt"), b"hello").unwrap();
        fs::write(src.join("sub/nested.txt"), b"world").unwrap();

        copy_dir_all(&src, &dst).unwrap();

        assert!(dst.join("file.txt").exists());
        assert!(dst.join("sub/nested.txt").exists());
        assert_eq!(fs::read_to_string(dst.join("file.txt")).unwrap(), "hello");
        assert_eq!(
            fs::read_to_string(dst.join("sub/nested.txt")).unwrap(),
            "world"
        );
    }

    #[test]
    fn apply_replacements_is_noop_when_empty() {
        let tmp = TempDir::new().unwrap();
        let preview = tmp.path().join("preview");
        fs::create_dir_all(&preview).unwrap();
        fs::write(preview.join("track.txt"), b"data").unwrap();

        apply_replacements(&preview, &[]).unwrap();

        assert_eq!(
            fs::read_to_string(preview.join("track.txt")).unwrap(),
            "data"
        );
    }
}
