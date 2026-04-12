use crate::converters::dds;
use crate::errors::AppError;
use crate::models::repack::{RepackOptions, TextureReplacementOpt};
use crate::parsers::kn5::Kn5File;
use std::collections::HashMap;
use std::path::Path;
use tauri::{AppHandle, Emitter};

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(dst)?;
    for entry in walkdir::WalkDir::new(src)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let rel = entry.path().strip_prefix(src).unwrap();
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

fn update_json_file(path: &Path, opts: &RepackOptions) -> Result<(), AppError> {
    let content = std::fs::read_to_string(path)?;
    let mut json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| AppError::Serialize(e.to_string()))?;
    if let Some(obj) = json.as_object_mut() {
        obj.insert(
            "name".to_string(),
            serde_json::Value::String(opts.meta.name.clone()),
        );
        obj.insert(
            "author".to_string(),
            serde_json::Value::String(opts.meta.author.clone()),
        );
        obj.insert(
            "version".to_string(),
            serde_json::Value::String(opts.meta.version.clone()),
        );
        obj.insert(
            "description".to_string(),
            serde_json::Value::String(opts.meta.description.clone()),
        );
        if let Some(car) = &opts.car_meta {
            obj.insert(
                "brand".to_string(),
                serde_json::Value::String(car.brand.clone()),
            );
            obj.insert(
                "class".to_string(),
                serde_json::Value::String(car.car_class.clone()),
            );
            obj.insert("bhp".to_string(), serde_json::json!(car.bhp));
            obj.insert("weight".to_string(), serde_json::json!(car.weight));
        }
        if let Some(track) = &opts.track_meta {
            obj.insert(
                "country".to_string(),
                serde_json::Value::String(track.country.clone()),
            );
            obj.insert("length".to_string(), serde_json::json!(track.length));
            obj.insert("pitboxes".to_string(), serde_json::json!(track.pitboxes));
        }
    }
    let updated =
        serde_json::to_string_pretty(&json).map_err(|e| AppError::Serialize(e.to_string()))?;
    std::fs::write(path, updated)?;
    Ok(())
}

fn find_and_update_json(dir: &Path, filename: &str, opts: &RepackOptions) -> Result<(), AppError> {
    let flat = [dir.join(filename), dir.join("ui").join(filename)];
    let mut found: Vec<std::path::PathBuf> =
        flat.iter().filter(|p| p.exists()).cloned().collect();

    let ui_path = dir.join("ui");
    if ui_path.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&ui_path) {
            for entry in entries.flatten() {
                let sub = entry.path();
                if sub.is_dir() {
                    let candidate = sub.join(filename);
                    if candidate.exists() {
                        found.push(candidate);
                    }
                }
            }
        }
    }

    for path in &found {
        update_json_file(path, opts)?;
    }
    Ok(())
}

fn patch_kn5(
    copied_kn5_path: &Path,
    replacements: &[&TextureReplacementOpt],
) -> Result<(), AppError> {
    let mut kn5 = Kn5File::open(copied_kn5_path)?;
    for r in replacements {
        let png_data = std::fs::read(&r.source_path)?;
        let img = image::load_from_memory(&png_data)
            .map_err(|e| AppError::ImageDecode(e.to_string()))?;
        let dds_data = dds::encode_from_image(&img, &r.original_format)?;
        kn5.replace_texture_data(&r.texture_name, dds_data)?;
    }
    kn5.save(copied_kn5_path)?;
    Ok(())
}

pub fn repack_mod_inner(
    opts: &RepackOptions,
    progress_cb: &dyn Fn(&str, u32, u32),
) -> Result<(), AppError> {
    let mod_path = Path::new(&opts.mod_path);
    let new_folder_name = opts.meta.folder_name.trim();

    let temp_dir = tempfile::tempdir()?;
    let copy_dst = temp_dir.path().join(new_folder_name);

    progress_cb("Copying files", 1, 4);
    copy_dir_recursive(mod_path, &copy_dst)?;

    progress_cb("Updating metadata", 2, 4);
    find_and_update_json(&copy_dst, "ui_car.json", opts)?;
    find_and_update_json(&copy_dst, "ui_track.json", opts)?;

    let mut kn5_groups: HashMap<String, Vec<&TextureReplacementOpt>> = HashMap::new();
    let mut skin_replacements: Vec<&TextureReplacementOpt> = Vec::new();

    for r in &opts.replacements {
        if let Some(kn5) = &r.kn5_file {
            kn5_groups.entry(kn5.clone()).or_default().push(r);
        } else if r.skin_folder.is_some() {
            skin_replacements.push(r);
        }
    }

    let kn5_total = kn5_groups.len() as u32;
    let grand_total = 2 + kn5_total + 1;

    for (step_i, (original_kn5_path, replacements)) in kn5_groups.iter().enumerate() {
        let kn5_name = Path::new(original_kn5_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        progress_cb(
            &format!("Recompiling textures in {kn5_name}"),
            3 + step_i as u32,
            grand_total,
        );

        let rel = Path::new(original_kn5_path)
            .strip_prefix(mod_path)
            .map(|r| r.to_path_buf())
            .unwrap_or_else(|_| Path::new(&kn5_name).to_path_buf());
        let copied_kn5_path = copy_dst.join(rel);
        patch_kn5(&copied_kn5_path, replacements)?;
    }

    for r in &skin_replacements {
        if let Some(skin_folder) = &r.skin_folder {
            let dst = copy_dst
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

    progress_cb("Creating archive", grand_total, grand_total);
    let output_path = Path::new(&opts.output_path);
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    sevenz_rust::compress_to_path(temp_dir.path(), output_path)
        .map_err(|e| AppError::Serialize(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub async fn repack_mod(app: AppHandle, opts: RepackOptions) -> Result<(), String> {
    repack_mod_inner(&opts, &|label, current, total| {
        let _ = app.emit(
            "repack-progress",
            serde_json::json!({
                "label": label,
                "current": current,
                "total": total,
            }),
        );
    })
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::mod_info::ModMeta;
    use image::{DynamicImage, ImageBuffer, Rgba};
    use image_dds::{ImageFormat, Mipmaps, Quality, dds_from_image};

    fn make_mod_meta(folder_name: &str) -> ModMeta {
        ModMeta {
            name: "Test Mod".to_string(),
            folder_name: folder_name.to_string(),
            author: "Tester".to_string(),
            version: "2.0".to_string(),
            description: "Updated desc".to_string(),
        }
    }

    fn make_tiny_png_bytes() -> Vec<u8> {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_fn(4, 4, |_, _| Rgba([0, 128, 255, 255]));
        let mut buf = Vec::new();
        DynamicImage::ImageRgba8(img)
            .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .unwrap();
        buf
    }

    fn make_tiny_dds() -> Vec<u8> {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_fn(4, 4, |_, _| Rgba([255, 0, 0, 255]));
        let rgba = DynamicImage::ImageRgba8(img).to_rgba8();
        let dds = dds_from_image(&rgba, ImageFormat::BC1RgbaUnorm, Quality::Fast, Mipmaps::Disabled)
            .unwrap();
        let mut out = Vec::new();
        dds.write(&mut out).unwrap();
        out
    }

    fn build_minimal_kn5(texture_name: &str, dds_data: &[u8]) -> Vec<u8> {
        use std::io::Write;
        let mut buf: Vec<u8> = Vec::new();
        buf.write_all(b"sc6969").unwrap();
        buf.write_all(&5u32.to_le_bytes()).unwrap();
        buf.write_all(&1u32.to_le_bytes()).unwrap();
        buf.write_all(&1u32.to_le_bytes()).unwrap();
        buf.write_all(&(texture_name.len() as u32).to_le_bytes()).unwrap();
        buf.write_all(texture_name.as_bytes()).unwrap();
        buf.write_all(&(dds_data.len() as u32).to_le_bytes()).unwrap();
        buf.write_all(dds_data).unwrap();
        buf
    }

    #[test]
    fn test_copy_dir_recursive_creates_structure() {
        let src = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(src.path().join("sub")).unwrap();
        std::fs::write(src.path().join("root.txt"), b"root").unwrap();
        std::fs::write(src.path().join("sub").join("child.txt"), b"child").unwrap();

        let dst = tempfile::tempdir().unwrap();
        let target = dst.path().join("copy");
        copy_dir_recursive(src.path(), &target).unwrap();

        assert!(target.join("root.txt").exists());
        assert!(target.join("sub").join("child.txt").exists());
        assert_eq!(std::fs::read(target.join("root.txt")).unwrap(), b"root");
        assert_eq!(std::fs::read(target.join("sub").join("child.txt")).unwrap(), b"child");
    }

    #[test]
    fn test_find_and_update_json_updates_car_fields() {
        let dir = tempfile::tempdir().unwrap();
        let original = r#"{"name":"Old Name","author":"Old Author","version":"1.0","description":"old","brand":"OldBrand","class":"GT2","bhp":400.0,"weight":1200.0}"#;
        std::fs::write(dir.path().join("ui_car.json"), original).unwrap();

        let opts = RepackOptions {
            mod_path: dir.path().to_string_lossy().to_string(),
            output_path: "/tmp/out.7z".to_string(),
            meta: make_mod_meta("test_mod"),
            car_meta: Some(crate::models::mod_info::CarMeta {
                brand: "NewBrand".to_string(),
                car_class: "GT3".to_string(),
                bhp: 550.0,
                weight: 1300.0,
            }),
            track_meta: None,
            replacements: vec![],
        };

        find_and_update_json(dir.path(), "ui_car.json", &opts).unwrap();

        let updated: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(dir.path().join("ui_car.json")).unwrap())
                .unwrap();
        assert_eq!(updated["name"], "Test Mod");
        assert_eq!(updated["author"], "Tester");
        assert_eq!(updated["version"], "2.0");
        assert_eq!(updated["brand"], "NewBrand");
        assert_eq!(updated["class"], "GT3");
    }

    #[test]
    fn test_find_and_update_json_in_ui_subdir() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("ui").join("layout")).unwrap();
        let original = r#"{"name":"Old","country":"France","length":4000.0,"pitboxes":20}"#;
        std::fs::write(
            dir.path().join("ui").join("layout").join("ui_track.json"),
            original,
        )
        .unwrap();

        let opts = RepackOptions {
            mod_path: dir.path().to_string_lossy().to_string(),
            output_path: "/tmp/out.7z".to_string(),
            meta: make_mod_meta("test_track"),
            car_meta: None,
            track_meta: Some(crate::models::mod_info::TrackMeta {
                country: "Italy".to_string(),
                length: 5000.0,
                pitboxes: 30,
            }),
            replacements: vec![],
        };

        find_and_update_json(dir.path(), "ui_track.json", &opts).unwrap();

        let updated: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(
                dir.path().join("ui").join("layout").join("ui_track.json"),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(updated["name"], "Test Mod");
        assert_eq!(updated["country"], "Italy");
        assert_eq!(updated["pitboxes"], 30);
    }

    #[test]
    fn test_repack_mod_inner_creates_archive() {
        let mod_dir = tempfile::tempdir().unwrap();
        std::fs::write(
            mod_dir.path().join("ui_car.json"),
            r#"{"name":"Car","author":"A","version":"1.0","description":""}"#,
        )
        .unwrap();

        let out_dir = tempfile::tempdir().unwrap();
        let out_path = out_dir.path().join("car_mod.7z");

        let opts = RepackOptions {
            mod_path: mod_dir.path().to_string_lossy().to_string(),
            output_path: out_path.to_string_lossy().to_string(),
            meta: make_mod_meta("test_car"),
            car_meta: None,
            track_meta: None,
            replacements: vec![],
        };

        let steps: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(vec![]);
        repack_mod_inner(&opts, &|label, _, _| {
            steps.lock().unwrap().push(label.to_string());
        })
        .unwrap();

        assert!(out_path.exists());
        assert!(out_path.metadata().unwrap().len() > 0);

        let collected = steps.into_inner().unwrap();
        assert!(collected.iter().any(|s| s.contains("Copying")));
        assert!(collected.iter().any(|s| s.contains("metadata")));
        assert!(collected.iter().any(|s| s.contains("archive")));
    }

    #[test]
    fn test_repack_mod_inner_metadata_updated_in_archive() {
        let mod_dir = tempfile::tempdir().unwrap();
        std::fs::write(
            mod_dir.path().join("ui_car.json"),
            r#"{"name":"Old Car","author":"Old","version":"0.1","description":""}"#,
        )
        .unwrap();

        let out_dir = tempfile::tempdir().unwrap();
        let out_path = out_dir.path().join("car_mod.7z");

        let opts = RepackOptions {
            mod_path: mod_dir.path().to_string_lossy().to_string(),
            output_path: out_path.to_string_lossy().to_string(),
            meta: make_mod_meta("updated_car"),
            car_meta: None,
            track_meta: None,
            replacements: vec![],
        };

        repack_mod_inner(&opts, &|_, _, _| {}).unwrap();
        assert!(out_path.exists());

        let extract_dir = tempfile::tempdir().unwrap();
        sevenz_rust::decompress_file(&out_path, extract_dir.path()).unwrap();

        let json_path = extract_dir.path().join("updated_car").join("ui_car.json");
        assert!(json_path.exists(), "ui_car.json missing in archive");
        let json: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(json_path).unwrap()).unwrap();
        assert_eq!(json["name"], "Test Mod");
        assert_eq!(json["author"], "Tester");
        assert_eq!(json["version"], "2.0");
    }

    #[test]
    fn test_repack_mod_inner_patches_kn5() {
        let mod_dir = tempfile::tempdir().unwrap();
        std::fs::write(
            mod_dir.path().join("ui_car.json"),
            r#"{"name":"Car","author":"A","version":"1.0","description":""}"#,
        )
        .unwrap();

        let dds_data = make_tiny_dds();
        let kn5_bytes = build_minimal_kn5("body.dds", &dds_data);
        let kn5_path = mod_dir.path().join("car.kn5");
        std::fs::write(&kn5_path, &kn5_bytes).unwrap();

        let png_dir = tempfile::tempdir().unwrap();
        let png_path = png_dir.path().join("body.png");
        std::fs::write(&png_path, make_tiny_png_bytes()).unwrap();

        let out_dir = tempfile::tempdir().unwrap();
        let out_path = out_dir.path().join("car_mod.7z");

        let opts = RepackOptions {
            mod_path: mod_dir.path().to_string_lossy().to_string(),
            output_path: out_path.to_string_lossy().to_string(),
            meta: make_mod_meta("car_patched"),
            car_meta: None,
            track_meta: None,
            replacements: vec![TextureReplacementOpt {
                texture_id: "tex_1".to_string(),
                source_path: png_path.to_string_lossy().to_string(),
                kn5_file: Some(kn5_path.to_string_lossy().to_string()),
                texture_name: "body.dds".to_string(),
                skin_folder: None,
                original_format: "BC1".to_string(),
            }],
        };

        repack_mod_inner(&opts, &|_, _, _| {}).unwrap();
        assert!(out_path.exists());

        let extract_dir = tempfile::tempdir().unwrap();
        sevenz_rust::decompress_file(&out_path, extract_dir.path()).unwrap();

        let patched_kn5 = extract_dir.path().join("car_patched").join("car.kn5");
        assert!(patched_kn5.exists());
        let kn5 = Kn5File::open(&patched_kn5).unwrap();
        let tex_data = kn5.get_texture_data("body.dds").unwrap();
        assert!(tex_data.starts_with(b"DDS "), "patched texture should be DDS");
    }

    #[test]
    fn test_repack_mod_inner_unchanged_kn5_preserved() {
        let mod_dir = tempfile::tempdir().unwrap();
        std::fs::write(
            mod_dir.path().join("ui_car.json"),
            r#"{"name":"Car","author":"A","version":"1.0","description":""}"#,
        )
        .unwrap();

        let dds_data = make_tiny_dds();
        let kn5_bytes = build_minimal_kn5("unchanged.dds", &dds_data);
        let kn5_path = mod_dir.path().join("unchanged.kn5");
        std::fs::write(&kn5_path, &kn5_bytes).unwrap();

        let out_dir = tempfile::tempdir().unwrap();
        let out_path = out_dir.path().join("car_mod.7z");

        let opts = RepackOptions {
            mod_path: mod_dir.path().to_string_lossy().to_string(),
            output_path: out_path.to_string_lossy().to_string(),
            meta: make_mod_meta("car_unchanged"),
            car_meta: None,
            track_meta: None,
            replacements: vec![],
        };

        repack_mod_inner(&opts, &|_, _, _| {}).unwrap();

        let extract_dir = tempfile::tempdir().unwrap();
        sevenz_rust::decompress_file(&out_path, extract_dir.path()).unwrap();

        let extracted_kn5 = extract_dir.path().join("car_unchanged").join("unchanged.kn5");
        assert!(extracted_kn5.exists());
        let extracted_bytes = std::fs::read(&extracted_kn5).unwrap();
        assert_eq!(
            extracted_bytes, kn5_bytes,
            "unchanged KN5 must be byte-identical"
        );
    }
}
