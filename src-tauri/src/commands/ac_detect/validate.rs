use std::path::Path;

use serde_json::Value;

use super::types::AcInstallInfo;

const CONTENT_CARS: &str = "content/cars";
const CONTENT_TRACKS: &str = "content/tracks";
const ACS_EXE: &str = "acs.exe";
const APP_MANIFEST: &str = "../appmanifest_244210.acf";
const BUILD_INI: &str = "content/system/build.ini";
const VERSION_PREFIX: &str = "VERSION=";

pub fn validate_path(path: &str) -> Result<AcInstallInfo, String> {
    let root = Path::new(path);

    if !root.is_dir() {
        return Err(format!("Folder does not exist: {path}"));
    }

    let cars_dir = root.join(CONTENT_CARS);
    if !cars_dir.is_dir() {
        return Err(format!("Missing: {CONTENT_CARS}"));
    }

    let tracks_dir = root.join(CONTENT_TRACKS);
    if !tracks_dir.is_dir() {
        return Err(format!("Missing: {CONTENT_TRACKS}"));
    }

    let has_exe = root.join(ACS_EXE).exists();
    let has_manifest = root.join(APP_MANIFEST).exists();
    if !has_exe && !has_manifest {
        return Err(format!("Missing: {ACS_EXE} or appmanifest_244210.acf"));
    }

    let version = read_version(&root.join(BUILD_INI));
    let car_count = count_subdirs(&cars_dir);
    let track_count = count_subdirs(&tracks_dir);

    Ok(AcInstallInfo {
        path: path.to_string(),
        version,
        car_count,
        track_count,
    })
}

fn read_version(build_ini: &Path) -> Option<String> {
    let content = std::fs::read_to_string(build_ini).ok()?;
    content
        .lines()
        .find(|l| l.starts_with(VERSION_PREFIX))
        .map(|l| l[VERSION_PREFIX.len()..].trim().to_string())
}

pub fn count_subdirs(dir: &Path) -> usize {
    std::fs::read_dir(dir)
        .map(|entries| entries.flatten().filter(|e| e.path().is_dir()).count())
        .unwrap_or(0)
}

pub fn read_ui_json(path: &Path) -> Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null)
}

pub fn find_ui_json(mod_path: &Path, filename: &str) -> Value {
    let flat = [mod_path.join(filename), mod_path.join("ui").join(filename)];
    if let Some(p) = flat.iter().find(|p| p.exists()) {
        return read_ui_json(p);
    }
    let ui_path = mod_path.join("ui");
    if ui_path.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&ui_path) {
            for entry in entries.flatten() {
                let sub = entry.path();
                if sub.is_dir() {
                    let candidate = sub.join(filename);
                    if candidate.exists() {
                        return read_ui_json(&candidate);
                    }
                }
            }
        }
    }
    Value::Null
}

pub fn string_field(json: &Value, key: &str) -> Option<String> {
    json.get(key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

pub fn count_layout_dirs(mod_path: &Path) -> usize {
    let ui_path = mod_path.join("ui");
    if !ui_path.is_dir() {
        return 1;
    }
    let layout_count = std::fs::read_dir(&ui_path)
        .map(|entries| entries.flatten().filter(|e| e.path().is_dir()).count())
        .unwrap_or(0);
    if layout_count == 0 {
        1
    } else {
        layout_count
    }
}

pub fn count_texture_files(mod_path: &Path) -> usize {
    const TEXTURE_EXTS: &[&str] = &["dds", "png", "jpg", "jpeg"];
    walkdir::WalkDir::new(mod_path)
        .max_depth(2)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| TEXTURE_EXTS.contains(&ext.to_lowercase().as_str()))
                .unwrap_or(false)
        })
        .count()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use super::*;

    fn make_valid_install(root: &Path) {
        fs::create_dir_all(root.join("content/cars/car_a")).unwrap();
        fs::create_dir_all(root.join("content/tracks/track_a")).unwrap();
        fs::write(root.join("acs.exe"), b"").unwrap();
    }

    #[test]
    fn test_validate_ac_folder_rejects_empty_dir() {
        let dir = TempDir::new().unwrap();
        let result = validate_path(dir.path().to_str().unwrap());
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_ac_folder_rejects_missing_cars() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("content/tracks/track_a")).unwrap();
        fs::write(dir.path().join("acs.exe"), b"").unwrap();
        let result = validate_path(dir.path().to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("content/cars"));
    }

    #[test]
    fn test_validate_ac_folder_rejects_missing_tracks() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("content/cars/car_a")).unwrap();
        fs::write(dir.path().join("acs.exe"), b"").unwrap();
        let result = validate_path(dir.path().to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("content/tracks"));
    }

    #[test]
    fn test_validate_ac_folder_rejects_missing_exe() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("content/cars/car_a")).unwrap();
        fs::create_dir_all(dir.path().join("content/tracks/track_a")).unwrap();
        let result = validate_path(dir.path().to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("acs.exe"));
    }

    #[test]
    fn test_validate_ac_folder_accepts_valid_install() {
        let dir = TempDir::new().unwrap();
        make_valid_install(dir.path());
        let result = validate_path(dir.path().to_str().unwrap());
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info.car_count, 1);
        assert_eq!(info.track_count, 1);
    }

    #[test]
    fn test_validate_ac_folder_reads_version() {
        let dir = TempDir::new().unwrap();
        make_valid_install(dir.path());
        fs::create_dir_all(dir.path().join("content/system")).unwrap();
        fs::write(
            dir.path().join("content/system/build.ini"),
            "VERSION=1.16.4\n",
        )
        .unwrap();
        let result = validate_path(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result.version, Some("1.16.4".to_string()));
    }
}
