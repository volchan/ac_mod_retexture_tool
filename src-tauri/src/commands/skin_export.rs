use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::commands::repack::{create_zip_archive, encode_replacement};
use crate::commands::skin::write_skin_meta;
use crate::errors::AppError;
use crate::models::repack::TextureReplacementOpt;
use crate::models::skin::SkinMeta;

/// Files Content Manager needs alongside the textures for the skin to behave
/// like the one it was forked from, even when only a few textures changed.
const ALWAYS_INCLUDED: &[&str] = &["ui_skin.json", "skin.ini", "cm_skin.json", "ext_config.ini"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinExportOptions {
    /// `content/cars/<car_id>` the skin belongs to.
    pub car_path: String,
    /// Folder the skin was opened from.
    pub skin_folder: String,
    pub output_path: String,
    pub meta: SkinMeta,
    /// Ship every file of the skin, rather than only what changed.
    pub full: bool,
    pub replacements: Vec<TextureReplacementOpt>,
}

/// Writes a standalone skin archive that unzips straight into an Assetto Corsa
/// install, so an author can share a skin without redistributing the car.
#[tauri::command]
pub async fn export_skin(opts: SkinExportOptions) -> Result<(), String> {
    export_skin_inner(&opts).map_err(|e| e.to_string())
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

fn export_skin_inner(opts: &SkinExportOptions) -> Result<(), AppError> {
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

    let staging = tempfile::tempdir()?;
    let skin_dst = staging
        .path()
        .join("content")
        .join("cars")
        .join(car_id)
        .join("skins")
        .join(&opts.meta.folder_name);
    std::fs::create_dir_all(&skin_dst)?;

    for file in files_to_ship(&source, opts) {
        let Some(name) = file.file_name() else {
            continue;
        };
        std::fs::copy(&file, skin_dst.join(name))?;
    }

    for replacement in &opts.replacements {
        std::fs::write(
            skin_dst.join(&replacement.texture_name),
            encode_replacement(replacement)?,
        )?;
    }

    write_skin_meta(&skin_dst, &opts.meta)?;

    let output = Path::new(&opts.output_path);
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    create_zip_archive(staging.path(), output, &|_, _, _| {})
}

/// A full export ships the whole skin folder. A partial one ships only the
/// files an installer cannot get from the car it is layered onto: the textures
/// that changed, plus the descriptors that identify the skin.
fn files_to_ship(source: &Path, opts: &SkinExportOptions) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(source) else {
        return vec![];
    };
    let replaced: Vec<&str> = opts
        .replacements
        .iter()
        .map(|r| r.texture_name.as_str())
        .collect();

    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .filter(|p| {
            if opts.full {
                return true;
            }
            let Some(name) = p.file_name().and_then(|s| s.to_str()) else {
                return false;
            };
            ALWAYS_INCLUDED.contains(&name) || replaced.contains(&name)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;
    use std::io::Read;

    fn meta(folder: &str) -> SkinMeta {
        SkinMeta {
            folder_name: folder.to_string(),
            skin_name: "Rosso Corsa".to_string(),
            driver_name: String::new(),
            team: String::new(),
            number: String::new(),
            country: String::new(),
        }
    }

    fn car_with_skin(files: &[&str]) -> tempfile::TempDir {
        let root = tempfile::tempdir().unwrap();
        let skin = root.path().join("ks_nissan_gtr/skins/super_silver");
        std::fs::create_dir_all(&skin).unwrap();
        for f in files {
            std::fs::write(skin.join(f), b"data").unwrap();
        }
        root
    }

    fn options(root: &Path, out: &Path, full: bool) -> SkinExportOptions {
        SkinExportOptions {
            car_path: root.join("ks_nissan_gtr").to_string_lossy().to_string(),
            skin_folder: "super_silver".to_string(),
            output_path: out.to_string_lossy().to_string(),
            meta: meta("super_silver"),
            full,
            replacements: vec![],
        }
    }

    fn zip_entries(path: &Path) -> BTreeSet<String> {
        let file = std::fs::File::open(path).unwrap();
        let mut zip = zip::ZipArchive::new(file).unwrap();
        (0..zip.len())
            .map(|i| zip.by_index(i).unwrap().name().to_string())
            .collect()
    }

    #[test]
    fn full_export_ships_the_whole_skin_under_the_content_cars_layout() {
        let root = car_with_skin(&["body.dds", "livery.png", "led_strip_1.kn5", "ui_skin.json"]);
        let out = root.path().join("skin.zip");

        export_skin_inner(&options(root.path(), &out, true)).unwrap();

        let entries = zip_entries(&out);
        let prefix = "content/cars/ks_nissan_gtr/skins/super_silver/";
        for name in ["body.dds", "livery.png", "led_strip_1.kn5", "ui_skin.json"] {
            assert!(
                entries.contains(&format!("{prefix}{name}")),
                "missing {name} in {entries:?}"
            );
        }
    }

    #[test]
    fn partial_export_keeps_descriptors_and_drops_untouched_textures() {
        let root = car_with_skin(&["body.dds", "other.dds", "ui_skin.json", "skin.ini"]);
        let out = root.path().join("skin.zip");
        let mut opts = options(root.path(), &out, false);
        let source = root.path().join("replacement.png");
        image::DynamicImage::ImageRgba8(image::RgbaImage::new(4, 4))
            .save(&source)
            .unwrap();
        opts.replacements = vec![TextureReplacementOpt {
            texture_id: "tex".to_string(),
            source_path: source.to_string_lossy().to_string(),
            kn5_file: None,
            texture_name: "body.dds".to_string(),
            skin_folder: Some("super_silver".to_string()),
            original_format: "PNG".to_string(),
            hero_image_path: None,
        }];

        export_skin_inner(&opts).unwrap();

        let entries = zip_entries(&out);
        let prefix = "content/cars/ks_nissan_gtr/skins/super_silver/";
        assert!(entries.contains(&format!("{prefix}body.dds")));
        assert!(entries.contains(&format!("{prefix}ui_skin.json")));
        assert!(entries.contains(&format!("{prefix}skin.ini")));
        assert!(!entries.contains(&format!("{prefix}other.dds")));
    }

    #[test]
    fn renaming_the_skin_writes_it_under_the_new_folder() {
        let root = car_with_skin(&["body.dds", "ui_skin.json"]);
        let out = root.path().join("skin.zip");
        let mut opts = options(root.path(), &out, true);
        opts.meta = meta("my_livery");

        export_skin_inner(&opts).unwrap();

        let entries = zip_entries(&out);
        assert!(entries.contains("content/cars/ks_nissan_gtr/skins/my_livery/body.dds"));
        assert!(!entries.iter().any(|e| e.contains("super_silver")));
    }

    #[test]
    fn export_writes_the_edited_metadata_into_the_archive() {
        let root = car_with_skin(&["ui_skin.json"]);
        std::fs::write(
            root.path()
                .join("ks_nissan_gtr/skins/super_silver/ui_skin.json"),
            br#"{"skinname":"Old","priority":3}"#,
        )
        .unwrap();
        let out = root.path().join("skin.zip");

        export_skin_inner(&options(root.path(), &out, true)).unwrap();

        let file = std::fs::File::open(&out).unwrap();
        let mut zip = zip::ZipArchive::new(file).unwrap();
        let mut text = String::new();
        zip.by_name("content/cars/ks_nissan_gtr/skins/super_silver/ui_skin.json")
            .unwrap()
            .read_to_string(&mut text)
            .unwrap();
        let json: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(json["skinname"], "Rosso Corsa");
        assert_eq!(json["priority"], 3);
    }

    #[test]
    fn export_fails_when_the_skin_folder_is_missing() {
        let root = car_with_skin(&["body.dds"]);
        let out = root.path().join("skin.zip");
        let mut opts = options(root.path(), &out, true);
        opts.skin_folder = "does_not_exist".to_string();

        assert!(export_skin_inner(&opts).is_err());
    }
}
