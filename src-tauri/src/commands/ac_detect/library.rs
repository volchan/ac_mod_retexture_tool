use std::path::Path;

use super::types::LibraryEntry;
use super::validate::{
    count_layout_dirs, count_subdirs, count_texture_files, find_ui_json, string_field,
};

const UI_CAR_JSON: &str = "ui_car.json";
const UI_TRACK_JSON: &str = "ui_track.json";
const KUNOS_PREFIXES: &[&str] = &["ks_", "kn_"];
const MOD_TYPE_CAR: &str = "car";
const MOD_TYPE_TRACK: &str = "track";

pub fn build_car_entry(folder_id: &str, folder_path: &Path) -> LibraryEntry {
    let json = find_ui_json(folder_path, UI_CAR_JSON);
    let name = string_field(&json, "name").unwrap_or_else(|| folder_id.to_string());
    let author = string_field(&json, "author");
    let brand = string_field(&json, "brand");

    let bhp = parse_numeric_field(&json, "bhp")
        .or_else(|| parse_specs_field(&json, "bhp"));
    let weight = parse_numeric_field(&json, "weight")
        .or_else(|| parse_specs_field(&json, "weight"));
    let year = json
        .get("year")
        .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse().ok()));

    let skin_count = count_subdirs(&folder_path.join("skins"));
    let texture_count = count_texture_files(folder_path);
    let is_kunos = is_kunos_folder(folder_id);

    LibraryEntry {
        id: folder_id.to_string(),
        mod_type: MOD_TYPE_CAR.to_string(),
        path: folder_path.to_string_lossy().to_string(),
        name,
        is_kunos,
        author,
        texture_count,
        brand,
        bhp,
        weight,
        year,
        skin_count: Some(skin_count),
        country: None,
        length: None,
        pitboxes: None,
        layouts: None,
    }
}

pub fn build_track_entry(folder_id: &str, folder_path: &Path) -> LibraryEntry {
    let json = find_ui_json(folder_path, UI_TRACK_JSON);
    let name = string_field(&json, "name").unwrap_or_else(|| folder_id.to_string());
    let author = string_field(&json, "author");
    let country = string_field(&json, "country");

    let length = json
        .get("length")
        .and_then(|v| v.as_f64().or_else(|| v.as_str()?.parse().ok()));
    let pitboxes = json
        .get("pitboxes")
        .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse().ok()));

    let layouts = count_layout_dirs(folder_path);
    let texture_count = count_texture_files(folder_path);
    let is_kunos = is_kunos_folder(folder_id);

    LibraryEntry {
        id: folder_id.to_string(),
        mod_type: MOD_TYPE_TRACK.to_string(),
        path: folder_path.to_string_lossy().to_string(),
        name,
        is_kunos,
        author,
        texture_count,
        brand: None,
        bhp: None,
        weight: None,
        year: None,
        skin_count: None,
        country,
        length,
        pitboxes,
        layouts: Some(layouts),
    }
}

fn is_kunos_folder(id: &str) -> bool {
    KUNOS_PREFIXES.iter().any(|p| id.starts_with(p))
}

fn parse_numeric_field(json: &serde_json::Value, key: &str) -> Option<f64> {
    json.get(key)
        .and_then(|v| v.as_f64().or_else(|| v.as_str()?.parse().ok()))
}

fn parse_specs_field(json: &serde_json::Value, key: &str) -> Option<f64> {
    json.get("specs")
        .and_then(|specs| specs.get(key))
        .and_then(|v| v.as_f64().or_else(|| v.as_str()?.parse().ok()))
}

pub fn walk_content_dir(dir: &Path) -> Vec<(String, std::path::PathBuf)> {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.path().is_dir())
                .map(|e| {
                    let id = e.file_name().to_string_lossy().to_string();
                    (id, e.path())
                })
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use super::*;

    #[test]
    fn test_is_kunos_detection() {
        assert!(is_kunos_folder("ks_ferrari_458"));
        assert!(is_kunos_folder("kn_ferrari_458"));
        assert!(!is_kunos_folder("ferrari_458_gt3"));
        assert!(!is_kunos_folder("my_custom_car"));
    }

    #[test]
    fn test_list_ac_content_returns_entries() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();

        let car_path = root.join("content/cars/ks_ferrari_458");
        fs::create_dir_all(&car_path).unwrap();
        fs::write(
            car_path.join("ui_car.json"),
            r#"{"name":"Ferrari 458","brand":"Ferrari","bhp":570,"weight":1380}"#,
        )
        .unwrap();
        fs::create_dir_all(car_path.join("skins/default")).unwrap();

        let track_path = root.join("content/tracks/ks_monza");
        fs::create_dir_all(&track_path).unwrap();
        fs::write(
            track_path.join("ui_track.json"),
            r#"{"name":"Monza","country":"Italy","length":5793,"pitboxes":28}"#,
        )
        .unwrap();

        let cars_dir = root.join("content/cars");
        let car_entries = walk_content_dir(&cars_dir);
        assert_eq!(car_entries.len(), 1);
        let (id, path) = &car_entries[0];
        let entry = build_car_entry(id, path);
        assert_eq!(entry.name, "Ferrari 458");
        assert_eq!(entry.mod_type, MOD_TYPE_CAR);
        assert!(entry.is_kunos);
        assert_eq!(entry.brand, Some("Ferrari".to_string()));
        assert_eq!(entry.bhp, Some(570.0));
        assert_eq!(entry.skin_count, Some(1));

        let tracks_dir = root.join("content/tracks");
        let track_entries = walk_content_dir(&tracks_dir);
        assert_eq!(track_entries.len(), 1);
        let (id, path) = &track_entries[0];
        let entry = build_track_entry(id, path);
        assert_eq!(entry.name, "Monza");
        assert_eq!(entry.mod_type, MOD_TYPE_TRACK);
        assert!(entry.is_kunos);
        assert_eq!(entry.country, Some("Italy".to_string()));
        assert_eq!(entry.pitboxes, Some(28));
    }
}
