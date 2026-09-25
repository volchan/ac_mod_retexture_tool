use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::commands::repack::{
    copy_dir_recursive, create_zip_archive, patch_kn5, write_replacement,
};
use crate::commands::skin::{ensure_safe_folder_name, write_skin_meta};
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
    // A recursive copy plus a full zip is seconds of blocking work, and on the
    // async runtime it stalls every other command for the whole export.
    tokio::task::spawn_blocking(move || export_skin_inner(&opts))
        .await
        .map_err(|e| format!("Task failed: {e}"))?
        .map_err(|e: AppError| e.to_string())
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

fn export_skin_inner(opts: &SkinExportOptions) -> Result<(), AppError> {
    ensure_safe_folder_name(&opts.skin_folder)?;
    ensure_safe_folder_name(&opts.meta.folder_name)?;

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

    if opts.full {
        copy_dir_recursive(&source, &skin_dst)?;
    } else {
        for file in files_to_ship(&source, opts) {
            // Kept at the path the skin puts it at: flattening `extension/` onto
            // the skin root loads nothing, and two files of the same name in
            // different folders would land on each other.
            let Ok(relative) = file.strip_prefix(&source) else {
                continue;
            };
            let destination = skin_dst.join(relative);
            if let Some(parent) = destination.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&file, destination)?;
        }
    }

    apply_replacements(&source, &skin_dst, &opts.replacements)?;

    write_skin_meta(&skin_dst, &opts.meta)?;

    let output = Path::new(&opts.output_path);
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    create_zip_archive(staging.path(), output, &|_, _, _| {})
}

/// A texture that lives inside one of the skin's own KN5 files has to go back
/// into that file: writing it loose beside the model would ship a texture the
/// model never looks for.
///
/// `skin_dst` is a copy of `skin_source` — the export staging folder, or the
/// throwaway skin Test in Game drives — so the models are patched in the copy.
pub(crate) fn apply_replacements(
    skin_source: &Path,
    skin_dst: &Path,
    replacements: &[TextureReplacementOpt],
) -> Result<(), AppError> {
    let mut per_kn5: std::collections::HashMap<&str, Vec<&TextureReplacementOpt>> =
        std::collections::HashMap::new();

    for replacement in replacements {
        match replacement.kn5_file.as_deref() {
            Some(kn5) if ships_with_the_skin(skin_source, kn5) => {
                per_kn5.entry(kn5).or_default().push(replacement)
            }
            // Anything else comes from the car's own model, which a skin never
            // rewrites: the override is a file of the same name beside it.
            _ => write_replacement(skin_dst, replacement)?,
        }
    }

    for (kn5, replacements) in per_kn5 {
        let name = Path::new(kn5).file_name().ok_or_else(|| {
            AppError::NotFound(format!("replacement points at an unnamed model: {kn5}"))
        })?;
        patch_kn5(&skin_dst.join(name), &replacements)?;
    }
    Ok(())
}

fn ships_with_the_skin(skin_source: &Path, kn5: &str) -> bool {
    Path::new(kn5).parent() == Some(skin_source)
}

/// A partial export ships only the files an installer cannot get from the car it
/// is layered onto: the textures that changed, plus the descriptors that identify
/// the skin.
///
/// Matched by lowercase name, and over the whole tree rather than the top level.
/// A skin shipping `UI_Skin.json`, or keeping a texture under `extension/`, was
/// dropped from the archive without a word — and only showed up as a skin that
/// loads wrong once somebody installed it.
fn files_to_ship(source: &Path, opts: &SkinExportOptions) -> Vec<PathBuf> {
    // A texture patched into a model means shipping the model, not the texture.
    let replaced: Vec<String> = opts
        .replacements
        .iter()
        .map(|r| match r.kn5_file.as_deref() {
            Some(kn5) if ships_with_the_skin(source, kn5) => Path::new(kn5)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_lowercase(),
            _ => r.texture_name.to_lowercase(),
        })
        .collect();

    walkdir::WalkDir::new(source)
        .into_iter()
        .flatten()
        .map(|entry| entry.into_path())
        .filter(|p| p.is_file())
        .filter(|p| {
            let Some(name) = p.file_name().and_then(|s| s.to_str()) else {
                return false;
            };
            let name = name.to_lowercase();
            ALWAYS_INCLUDED.contains(&name.as_str()) || replaced.contains(&name)
        })
        .collect()
}

#[cfg(test)]
pub(crate) mod tests {
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

    /// Windows and macOS hand `UI_Skin.json` back for `ui_skin.json`, so a skin
    /// spelling it that way looks fine until its archive is opened.
    #[test]
    fn partial_export_ships_descriptors_whatever_case_they_carry() {
        let root = car_with_skin(&["UI_Skin.json", "Ext_Config.ini", "body.dds"]);
        let source = root.path().join("ks_nissan_gtr/skins/super_silver");
        let out = root.path().join("out.zip");

        let shipped = shipped_names(&source, &options(root.path(), &out, false));

        assert!(shipped.contains("UI_Skin.json"), "got {shipped:?}");
        assert!(shipped.contains("Ext_Config.ini"), "got {shipped:?}");
    }

    #[test]
    fn partial_export_reaches_a_descriptor_kept_in_a_sub_folder() {
        let root = car_with_skin(&["ui_skin.json"]);
        let source = root.path().join("ks_nissan_gtr/skins/super_silver");
        std::fs::create_dir_all(source.join("extension")).unwrap();
        std::fs::write(source.join("extension/ext_config.ini"), b"data").unwrap();
        let out = root.path().join("out.zip");

        let shipped = shipped_names(&source, &options(root.path(), &out, false));

        assert!(shipped.contains("ext_config.ini"), "got {shipped:?}");
    }

    #[test]
    fn partial_export_leaves_out_what_the_car_already_carries() {
        let root = car_with_skin(&["ui_skin.json", "body.dds"]);
        let source = root.path().join("ks_nissan_gtr/skins/super_silver");
        let out = root.path().join("out.zip");

        let shipped = shipped_names(&source, &options(root.path(), &out, false));

        assert!(!shipped.contains("body.dds"), "got {shipped:?}");
    }

    fn shipped_names(source: &Path, opts: &SkinExportOptions) -> BTreeSet<String> {
        files_to_ship(source, opts)
            .iter()
            .filter_map(|p| p.file_name()?.to_str())
            .map(str::to_string)
            .collect()
    }

    pub(crate) fn minimal_kn5(texture: &str, data: &[u8]) -> Vec<u8> {
        let mut buf: Vec<u8> = Vec::new();
        buf.extend_from_slice(b"sc6969");
        buf.extend_from_slice(&5u32.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes()); // texture count
        buf.extend_from_slice(&1u32.to_le_bytes()); // active
        buf.extend_from_slice(&(texture.len() as u32).to_le_bytes());
        buf.extend_from_slice(texture.as_bytes());
        buf.extend_from_slice(&(data.len() as u32).to_le_bytes());
        buf.extend_from_slice(data);
        buf
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
    fn full_export_ships_nested_folders_as_well() {
        let root = car_with_skin(&["body.dds"]);
        let nested = root
            .path()
            .join("ks_nissan_gtr/skins/super_silver/extension");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("ext_config.ini"), b"cfg").unwrap();
        let out = root.path().join("skin.zip");

        export_skin_inner(&options(root.path(), &out, true)).unwrap();

        assert!(zip_entries(&out)
            .contains("content/cars/ks_nissan_gtr/skins/super_silver/extension/ext_config.ini"));
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
    fn a_texture_from_the_skins_own_model_goes_back_into_that_model() {
        let root = car_with_skin(&["ui_skin.json"]);
        let skin = root.path().join("ks_nissan_gtr/skins/super_silver");
        let kn5 = skin.join("led_strip_1.kn5");
        std::fs::write(&kn5, minimal_kn5("LED_Strip.dds", b"old pixels")).unwrap();

        let source = root.path().join("new.png");
        image::DynamicImage::ImageRgba8(image::RgbaImage::new(4, 4))
            .save(&source)
            .unwrap();

        let out = root.path().join("skin.zip");
        let mut opts = options(root.path(), &out, false);
        opts.replacements = vec![TextureReplacementOpt {
            texture_id: "tex".to_string(),
            source_path: source.to_string_lossy().to_string(),
            kn5_file: Some(kn5.to_string_lossy().to_string()),
            texture_name: "LED_Strip.dds".to_string(),
            skin_folder: Some("super_silver".to_string()),
            original_format: "PNG".to_string(),
            hero_image_path: None,
        }];

        export_skin_inner(&opts).unwrap();

        let entries = zip_entries(&out);
        let prefix = "content/cars/ks_nissan_gtr/skins/super_silver/";
        assert!(
            entries.contains(&format!("{prefix}led_strip_1.kn5")),
            "the model has to travel, not the texture: {entries:?}"
        );
        assert!(
            !entries.contains(&format!("{prefix}LED_Strip.dds")),
            "a loose copy would be a file the model never looks for"
        );

        let file = std::fs::File::open(&out).unwrap();
        let mut zip = zip::ZipArchive::new(file).unwrap();
        let mut packed = Vec::new();
        zip.by_name(&format!("{prefix}led_strip_1.kn5"))
            .unwrap()
            .read_to_end(&mut packed)
            .unwrap();
        let patched = root.path().join("packed.kn5");
        std::fs::write(&patched, &packed).unwrap();
        let reopened = crate::parsers::Kn5File::open(&patched).unwrap();
        assert_ne!(
            reopened.get_texture_data("LED_Strip.dds"),
            Some(b"old pixels".as_ref())
        );
    }

    #[test]
    fn a_car_texture_is_overridden_beside_the_model_never_inside_it() {
        // The rims live in the car's KN5. A skin repaints them with a file of the
        // same name; rewriting the car itself would change every other skin too.
        let root = car_with_skin(&["ui_skin.json"]);
        let car_kn5 = root.path().join("ks_nissan_gtr/nissan_gtr.kn5");
        std::fs::write(&car_kn5, minimal_kn5("EXT_Rim.dds", b"stock rims")).unwrap();
        let before = std::fs::read(&car_kn5).unwrap();

        let source = root.path().join("new.png");
        image::DynamicImage::ImageRgba8(image::RgbaImage::new(4, 4))
            .save(&source)
            .unwrap();

        let out = root.path().join("skin.zip");
        let mut opts = options(root.path(), &out, false);
        opts.replacements = vec![TextureReplacementOpt {
            texture_id: "tex".to_string(),
            source_path: source.to_string_lossy().to_string(),
            kn5_file: Some(car_kn5.to_string_lossy().to_string()),
            texture_name: "EXT_Rim.dds".to_string(),
            skin_folder: Some("super_silver".to_string()),
            original_format: "PNG".to_string(),
            hero_image_path: None,
        }];

        export_skin_inner(&opts).unwrap();

        let entries = zip_entries(&out);
        let prefix = "content/cars/ks_nissan_gtr/skins/super_silver/";
        assert!(
            entries.contains(&format!("{prefix}EXT_Rim.dds")),
            "the override travels as a loose file: {entries:?}"
        );
        assert!(
            !entries.iter().any(|e| e.ends_with("nissan_gtr.kn5")),
            "the car model has no business in a skin archive"
        );
        assert_eq!(
            std::fs::read(&car_kn5).unwrap(),
            before,
            "the installed car must come out untouched"
        );
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
