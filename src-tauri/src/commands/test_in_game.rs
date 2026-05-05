use std::collections::HashMap;
use std::path::Path;

use crate::commands::repack::patch_kn5;
use crate::converters::dds;
use crate::errors::AppError;
use crate::models::repack::TextureReplacementOpt;

#[tauri::command]
pub async fn test_in_game(
    ac_path: String,
    mod_path: String,
    car_id: String,
    replacements: Vec<TextureReplacementOpt>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || run(&ac_path, &mod_path, &car_id, &replacements))
        .await
        .map_err(|e| format!("Task failed: {e}"))?
        .map_err(|e: AppError| e.to_string())
}

fn run(
    ac_path: &str,
    mod_path: &str,
    car_id: &str,
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
    let race_ini_path = ac_root.join("cfg/race.ini");
    let acs_exe = ac_root.join("acs.exe");

    copy_dir_all(mod_root, &preview_path)?;
    apply_replacements(&preview_path, mod_root, replacements)?;

    let race_ini_backup = if race_ini_path.exists() {
        Some(std::fs::read_to_string(&race_ini_path)?)
    } else {
        None
    };

    std::fs::write(&race_ini_path, build_race_ini(&preview_name, car_id))?;

    let _status = std::process::Command::new(&acs_exe)
        .current_dir(ac_root)
        .spawn()?
        .wait()?;

    if preview_path.exists() {
        std::fs::remove_dir_all(&preview_path)?;
    }

    match race_ini_backup {
        Some(content) => std::fs::write(&race_ini_path, content)?,
        None => {
            if race_ini_path.exists() {
                std::fs::remove_file(&race_ini_path)?;
            }
        }
    }

    Ok(())
}

fn apply_replacements(
    preview_root: &Path,
    mod_root: &Path,
    replacements: &[TextureReplacementOpt],
) -> Result<(), AppError> {
    let mut kn5_groups: HashMap<String, Vec<&TextureReplacementOpt>> = HashMap::new();
    for r in replacements {
        if let Some(kn5) = &r.kn5_file {
            kn5_groups.entry(kn5.clone()).or_default().push(r);
        }
    }

    for (original_kn5_path, group) in &kn5_groups {
        let kn5_file = Path::new(original_kn5_path);
        let rel = kn5_file
            .strip_prefix(mod_root)
            .map(|r| r.to_path_buf())
            .unwrap_or_else(|_| {
                kn5_file
                    .file_name()
                    .map(std::path::Path::new)
                    .unwrap_or(kn5_file)
                    .to_path_buf()
            });
        patch_kn5(&preview_root.join(rel), group)?;
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

fn build_race_ini(track: &str, car: &str) -> String {
    format!(
        "[RACE]\nMODEL={car}\nTRACK={track}\nCONFIG_TRACK=\nSKIN=default\nAI_LEVEL=95\nFIXED_SETUP=0\nRANDOM_SETUP=0\n\n[SESSION_0]\nNAME=Free Practice\nTYPE=1\nTIME=120\nLAPS=0\nWAIT_TIME=60\n"
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
        let ini = build_race_ini("my_track_preview", "ks_abarth500");
        assert!(ini.contains("TRACK=my_track_preview"));
        assert!(ini.contains("MODEL=ks_abarth500"));
        assert!(ini.contains("TYPE=1"));
        assert!(ini.contains("TIME=120"));
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
        let mod_root = tmp.path().join("mod");
        fs::create_dir_all(&preview).unwrap();
        fs::create_dir_all(&mod_root).unwrap();
        fs::write(preview.join("track.txt"), b"data").unwrap();

        apply_replacements(&preview, &mod_root, &[]).unwrap();

        assert_eq!(
            fs::read_to_string(preview.join("track.txt")).unwrap(),
            "data"
        );
    }
}
