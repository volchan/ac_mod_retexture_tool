use std::path::Path;

use crate::errors::AppError;

#[tauri::command]
pub async fn test_in_game(ac_path: String, mod_path: String, car_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || run(&ac_path, &mod_path, &car_id))
        .await
        .map_err(|e| format!("Task failed: {e}"))?
        .map_err(|e: AppError| e.to_string())
}

fn run(ac_path: &str, mod_path: &str, car_id: &str) -> Result<(), AppError> {
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
}
