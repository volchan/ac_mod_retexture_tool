use std::path::Path;

use serde_json::Value;
use walkdir::WalkDir;

use crate::models::{CarMeta, ModFileEntry, ModManifest, ModMeta, ModType, SkinFolder, TrackMeta};

const UI_CAR_JSON: &str = "ui_car.json";
const UI_TRACK_JSON: &str = "ui_track.json";
const TYRES_INI: &str = "data/tyres.ini";
const SKINS_DIR: &str = "skins";

pub fn detect_mod_type(path: &Path) -> Option<ModType> {
    if path.join(UI_CAR_JSON).exists() || path.join("ui").join(UI_CAR_JSON).exists() {
        return Some(ModType::Car);
    }
    if path.join(UI_TRACK_JSON).exists() || path.join("ui").join(UI_TRACK_JSON).exists() {
        return Some(ModType::Track);
    }
    // Multi-layout tracks: ui_track.json is nested one level inside ui/ (e.g. ui/boot/)
    if let Some(t) = detect_type_in_ui_subdirs(path) {
        return Some(t);
    }
    if path.join(TYRES_INI).exists() {
        return Some(ModType::Car);
    }
    None
}

fn detect_type_in_ui_subdirs(path: &Path) -> Option<ModType> {
    let ui_path = path.join("ui");
    if !ui_path.is_dir() {
        return None;
    }
    let entries = std::fs::read_dir(&ui_path).ok()?;
    for entry in entries.flatten() {
        let sub = entry.path();
        if !sub.is_dir() {
            continue;
        }
        if sub.join(UI_CAR_JSON).exists() {
            return Some(ModType::Car);
        }
        if sub.join(UI_TRACK_JSON).exists() {
            return Some(ModType::Track);
        }
    }
    None
}

fn file_type_str(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("kn5") => "kn5",
        Some("dds") => "dds",
        Some("json") => "json",
        _ => "other",
    }
}

fn read_ui_json(path: &Path) -> Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null)
}

fn find_ui_json(mod_path: &Path, filename: &str) -> Value {
    let flat = [mod_path.join(filename), mod_path.join("ui").join(filename)];
    if let Some(p) = flat.iter().find(|p| p.exists()) {
        return read_ui_json(p);
    }
    // Multi-layout: check ui/<layout>/<filename>
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

fn string_field(json: &Value, key: &str) -> String {
    json.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

fn f32_field(json: &Value, key: &str) -> f32 {
    json.get(key).and_then(|v| v.as_f64()).unwrap_or(0.0) as f32
}

fn u32_field(json: &Value, key: &str) -> u32 {
    json.get(key)
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32
}

fn parse_car_meta(json: &Value) -> CarMeta {
    CarMeta {
        brand: string_field(json, "brand"),
        car_class: string_field(json, "class"),
        bhp: f32_field(json, "bhp"),
        weight: f32_field(json, "weight"),
    }
}

fn parse_track_meta(json: &Value) -> TrackMeta {
    TrackMeta {
        country: string_field(json, "country"),
        length: f32_field(json, "length"),
        pitboxes: u32_field(json, "pitboxes"),
    }
}

fn scan_skins(mod_path: &Path) -> Vec<SkinFolder> {
    let skins_path = mod_path.join(SKINS_DIR);
    if !skins_path.is_dir() {
        return vec![];
    }

    let mut skins = vec![];
    let entries = match std::fs::read_dir(&skins_path) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    for entry in entries.flatten() {
        let skin_path = entry.path();
        if !skin_path.is_dir() {
            continue;
        }
        let skin_name = skin_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();

        let files = WalkDir::new(&skin_path)
            .max_depth(1)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .map(|e| {
                let name = e
                    .file_name()
                    .to_str()
                    .unwrap_or_default()
                    .to_string();
                let path = e.path().to_string_lossy().to_string();
                let file_type = file_type_str(e.path()).to_string();
                ModFileEntry {
                    name,
                    path,
                    file_type,
                }
            })
            .collect();

        skins.push(SkinFolder {
            name: skin_name,
            path: skin_path.to_string_lossy().to_string(),
            files,
        });
    }

    skins.sort_by(|a, b| a.name.cmp(&b.name));
    skins
}

fn collect_files(mod_path: &Path) -> (Vec<ModFileEntry>, Vec<String>) {
    let mut files = vec![];
    let mut kn5_files = vec![];

    let skins_path = mod_path.join(SKINS_DIR);

    for entry in WalkDir::new(mod_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();

        if path.starts_with(&skins_path) {
            continue;
        }

        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        let path_str = path.to_string_lossy().to_string();
        let file_type = file_type_str(path).to_string();

        if file_type == "kn5" {
            kn5_files.push(path_str.clone());
        }

        files.push(ModFileEntry {
            name,
            path: path_str,
            file_type,
        });
    }

    (files, kn5_files)
}

#[tauri::command]
pub fn scan_mod_folder(path: String) -> Result<ModManifest, String> {
    let mod_path = Path::new(&path);

    if !mod_path.exists() {
        return Err(format!("Path does not exist: {path}"));
    }

    let mod_type = detect_mod_type(mod_path)
        .ok_or_else(|| format!("Could not determine mod type for: {path}"))?;

    let folder_name = mod_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();

    let (ui_json, car_meta, track_meta) = match mod_type {
        ModType::Car => {
            let json = find_ui_json(mod_path, UI_CAR_JSON);
            let car = parse_car_meta(&json);
            (json, Some(car), None)
        }
        ModType::Track => {
            let json = find_ui_json(mod_path, UI_TRACK_JSON);
            let track = parse_track_meta(&json);
            (json, None, Some(track))
        }
    };

    let meta = ModMeta {
        name: {
            let n = string_field(&ui_json, "name");
            if n.is_empty() { folder_name.clone() } else { n }
        },
        folder_name: folder_name.clone(),
        author: string_field(&ui_json, "author"),
        version: string_field(&ui_json, "version"),
        description: string_field(&ui_json, "description"),
    };

    let (files, kn5_files) = collect_files(mod_path);
    let skin_folders = scan_skins(mod_path);

    Ok(ModManifest {
        mod_type,
        path: path.clone(),
        meta,
        car_meta,
        track_meta,
        files,
        kn5_files,
        skin_folders,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use super::*;

    fn create_car_mod(dir: &TempDir) {
        let root = dir.path();
        fs::write(
            root.join(UI_CAR_JSON),
            r#"{"name":"Test Car","author":"Author","version":"1.0","description":"A car","brand":"Ferrari","class":"GT3","bhp":550,"weight":1300}"#,
        )
        .unwrap();
        fs::write(root.join("car.kn5"), b"kn5data").unwrap();

        let skins = root.join(SKINS_DIR);
        fs::create_dir_all(skins.join("default")).unwrap();
        fs::write(skins.join("default").join("livery.dds"), b"ddsdata").unwrap();
    }

    fn create_track_mod(dir: &TempDir) {
        let root = dir.path();
        fs::write(
            root.join(UI_TRACK_JSON),
            r#"{"name":"Test Track","author":"Track Author","version":"2.0","description":"A track","country":"Italy","length":5120,"pitboxes":30}"#,
        )
        .unwrap();
        fs::write(root.join("track.kn5"), b"kn5data").unwrap();
    }

    #[test]
    fn detects_car_mod_by_ui_car_json() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join(UI_CAR_JSON), b"{}").unwrap();
        assert_eq!(detect_mod_type(dir.path()), Some(ModType::Car));
    }

    #[test]
    fn detects_car_mod_by_tyres_ini() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("data")).unwrap();
        fs::write(dir.path().join(TYRES_INI), b"").unwrap();
        assert_eq!(detect_mod_type(dir.path()), Some(ModType::Car));
    }

    #[test]
    fn detects_track_mod_by_ui_track_json() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join(UI_TRACK_JSON), b"{}").unwrap();
        assert_eq!(detect_mod_type(dir.path()), Some(ModType::Track));
    }

    #[test]
    fn detects_track_mod_by_ui_subfolder() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("ui")).unwrap();
        fs::write(dir.path().join("ui").join(UI_TRACK_JSON), b"{}").unwrap();
        assert_eq!(detect_mod_type(dir.path()), Some(ModType::Track));
    }

    #[test]
    fn detects_car_mod_by_ui_subfolder() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("ui")).unwrap();
        fs::write(dir.path().join("ui").join(UI_CAR_JSON), b"{}").unwrap();
        assert_eq!(detect_mod_type(dir.path()), Some(ModType::Car));
    }

    #[test]
    fn returns_none_for_unknown_mod_type() {
        let dir = TempDir::new().unwrap();
        assert_eq!(detect_mod_type(dir.path()), None);
    }

    #[test]
    fn detects_track_mod_in_ui_layout_subdir() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("ui").join("boot")).unwrap();
        fs::write(dir.path().join("ui").join("boot").join(UI_TRACK_JSON), b"{}").unwrap();
        assert_eq!(detect_mod_type(dir.path()), Some(ModType::Track));
    }

    #[test]
    fn detects_car_mod_in_ui_layout_subdir() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("ui").join("v1")).unwrap();
        fs::write(dir.path().join("ui").join("v1").join(UI_CAR_JSON), b"{}").unwrap();
        assert_eq!(detect_mod_type(dir.path()), Some(ModType::Car));
    }

    #[test]
    fn find_ui_json_searches_layout_subdirs() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("ui").join("boot")).unwrap();
        let json = r#"{"name":"Layout Track","country":"USA"}"#;
        fs::write(dir.path().join("ui").join("boot").join(UI_TRACK_JSON), json).unwrap();

        let result = scan_mod_folder(dir.path().to_string_lossy().to_string()).unwrap();
        assert_eq!(result.mod_type, ModType::Track);
        assert_eq!(result.meta.name, "Layout Track");
    }

    #[test]
    fn scan_car_mod_fields() {
        let dir = TempDir::new().unwrap();
        create_car_mod(&dir);
        let result = scan_mod_folder(dir.path().to_string_lossy().to_string()).unwrap();

        assert_eq!(result.mod_type, ModType::Car);
        assert_eq!(result.meta.name, "Test Car");
        assert_eq!(result.meta.author, "Author");
        assert_eq!(result.meta.version, "1.0");
        let car = result.car_meta.unwrap();
        assert_eq!(car.brand, "Ferrari");
        assert_eq!(car.car_class, "GT3");
        assert_eq!(car.bhp, 550.0);
        assert_eq!(car.weight, 1300.0);
        assert!(result.track_meta.is_none());
    }

    #[test]
    fn scan_track_mod_fields() {
        let dir = TempDir::new().unwrap();
        create_track_mod(&dir);
        let result = scan_mod_folder(dir.path().to_string_lossy().to_string()).unwrap();

        assert_eq!(result.mod_type, ModType::Track);
        assert_eq!(result.meta.name, "Test Track");
        assert_eq!(result.meta.author, "Track Author");
        let track = result.track_meta.unwrap();
        assert_eq!(track.country, "Italy");
        assert_eq!(track.pitboxes, 30);
        assert!(result.car_meta.is_none());
    }

    #[test]
    fn scan_collects_kn5_files() {
        let dir = TempDir::new().unwrap();
        create_car_mod(&dir);
        let result = scan_mod_folder(dir.path().to_string_lossy().to_string()).unwrap();

        assert_eq!(result.kn5_files.len(), 1);
        assert!(result.kn5_files[0].ends_with("car.kn5"));
    }

    #[test]
    fn scan_collects_skin_folders() {
        let dir = TempDir::new().unwrap();
        create_car_mod(&dir);
        let result = scan_mod_folder(dir.path().to_string_lossy().to_string()).unwrap();

        assert_eq!(result.skin_folders.len(), 1);
        assert_eq!(result.skin_folders[0].name, "default");
        assert_eq!(result.skin_folders[0].files.len(), 1);
        assert_eq!(result.skin_folders[0].files[0].name, "livery.dds");
    }

    #[test]
    fn error_on_nonexistent_path() {
        let result = scan_mod_folder("/nonexistent/path/that/does/not/exist".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn error_on_unknown_mod_type() {
        let dir = TempDir::new().unwrap();
        let result = scan_mod_folder(dir.path().to_string_lossy().to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Could not determine mod type"));
    }

    #[test]
    fn file_type_str_returns_correct_types() {
        assert_eq!(file_type_str(Path::new("car.kn5")), "kn5");
        assert_eq!(file_type_str(Path::new("tex.dds")), "dds");
        assert_eq!(file_type_str(Path::new("ui.json")), "json");
        assert_eq!(file_type_str(Path::new("readme.txt")), "other");
        assert_eq!(file_type_str(Path::new("noextension")), "other");
    }

    #[test]
    fn scan_uses_folder_name_when_ui_json_name_is_empty() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join(UI_CAR_JSON), b"{}").unwrap();
        let result = scan_mod_folder(dir.path().to_string_lossy().to_string()).unwrap();
        let folder = dir.path().file_name().unwrap().to_str().unwrap().to_string();
        assert_eq!(result.meta.name, folder);
    }

    #[test]
    fn skins_excluded_from_main_files() {
        let dir = TempDir::new().unwrap();
        create_car_mod(&dir);
        let result = scan_mod_folder(dir.path().to_string_lossy().to_string()).unwrap();

        for file in &result.files {
            assert!(
                !file.path.contains("/skins/"),
                "skins should be excluded from main files: {}",
                file.path
            );
        }
    }
}
