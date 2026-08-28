use crate::converters::dds;
use crate::models::mod_info::ModType;
use crate::models::texture::{TextureCategory, TextureEntry, TextureSource};
use crate::parsers::kn5::Kn5File;
use crate::DecodeCancel;
use base64::engine::general_purpose;
use base64::Engine;
use std::io::Cursor;
use std::path::Path;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

pub fn categorize(name: &str, mod_type: &ModType) -> TextureCategory {
    let lower = name.to_lowercase();
    match mod_type {
        ModType::Car => {
            if lower.contains("body") || lower.contains("ext_") {
                TextureCategory::Body
            } else if lower.contains("interior")
                || lower.contains("int_")
                || lower.contains("cockpit")
            {
                TextureCategory::Interior
            } else if lower.contains("wheel") || lower.contains("rim") || lower.contains("tyre") {
                TextureCategory::Wheels
            } else {
                TextureCategory::Other
            }
        }
        ModType::Track => {
            if lower.contains("road") || lower.contains("asphalt") || lower.contains("pavement") {
                TextureCategory::Road
            } else if lower.contains("terrain")
                || lower.contains("grass")
                || lower.contains("dirt")
                || lower.contains("sand")
            {
                TextureCategory::Terrain
            } else if lower.contains("building")
                || lower.contains("wall")
                || lower.contains("house")
            {
                TextureCategory::Buildings
            } else if lower.contains("tree")
                || lower.contains("prop")
                || lower.contains("barrier")
                || lower.contains("fence")
            {
                TextureCategory::Props
            } else if lower.contains("sky") || lower.contains("cloud") {
                TextureCategory::Sky
            } else {
                TextureCategory::Other
            }
        }
    }
}

/// Returns `(display_name, abs_path, rel_path_from_mod_root)` triples for all loading screen PNGs.
/// `rel_path_from_mod_root` uses forward slashes and is what gets stored in `TextureEntry.path`.
/// For single-layout: display_name = "preview.png", rel = "preview.png" or "ui/preview.png".
/// For multi-layout:  display_name = "preview_{layout}.png", rel = "ui/{layout}/preview.png".
fn collect_hero_png_entries(mod_path: &Path) -> Vec<(String, std::path::PathBuf, String)> {
    let flat = [
        (mod_path.join("preview.png"), "preview.png".to_string()),
        (
            mod_path.join("ui").join("preview.png"),
            "ui/preview.png".to_string(),
        ),
    ];
    for (path, rel) in &flat {
        if path.exists() {
            return vec![("preview.png".to_string(), path.clone(), rel.clone())];
        }
    }

    let ui_path = mod_path.join("ui");
    if !ui_path.is_dir() {
        return vec![];
    }

    let mut layout_dirs: Vec<_> = std::fs::read_dir(&ui_path)
        .map(|d| d.flatten().filter(|e| e.path().is_dir()).collect())
        .unwrap_or_default();
    layout_dirs.sort_by_key(|e| e.file_name());

    let mut results = Vec::new();
    for entry in &layout_dirs {
        let sub = entry.path();
        let layout = sub
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let candidate = sub.join("preview.png");
        if candidate.exists() {
            let display_name = if layout_dirs.len() == 1 {
                "preview.png".to_string()
            } else {
                format!("preview_{layout}.png")
            };
            let rel = format!("ui/{layout}/preview.png");
            results.push((display_name, candidate, rel));
        }
    }
    results
}

#[tauri::command]
pub async fn cancel_decode(cancel: State<'_, DecodeCancel>) -> Result<(), String> {
    cancel.0.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn decode_mod_textures(
    app: AppHandle,
    cancel: State<'_, DecodeCancel>,
    mod_path: String,
    mod_type: String,
) -> Result<(), String> {
    // Reset cancellation flag for this run
    cancel.0.store(false, Ordering::Relaxed);

    let path = Path::new(&mod_path);
    let mt = if mod_type == "car" {
        ModType::Car
    } else {
        ModType::Track
    };

    let kn5_files: Vec<_> = walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("kn5"))
        .collect();

    let total = kn5_files.len();

    for (i, entry) in kn5_files.iter().enumerate() {
        if cancel.0.load(Ordering::Relaxed) {
            return Ok(());
        }

        let kn5_path = entry.path();
        let kn5_name = kn5_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let _ = app.emit(
            "decode-progress",
            serde_json::json!({
                "current": i + 1,
                "total": total,
                "label": kn5_name,
            }),
        );

        let kn5 = match Kn5File::open(kn5_path) {
            Ok(k) => k,
            Err(e) => {
                let _ = app.emit("decode-error", e.to_string());
                continue;
            }
        };

        for tex_name in kn5.texture_names() {
            if cancel.0.load(Ordering::Relaxed) {
                return Ok(());
            }

            let data = match kn5.get_texture_data(tex_name) {
                Some(d) => d,
                None => continue,
            };

            let preview_url = dds::generate_thumbnail(data, 128).unwrap_or_default();
            let format = dds::detect_format(data);
            let (width, height) = dds::parse_dds_dimensions(data);
            let category = categorize(tex_name, &mt);

            let tex = TextureEntry {
                id: Uuid::new_v4().to_string(),
                name: tex_name.to_string(),
                path: kn5_path.to_string_lossy().to_string(),
                source: TextureSource::Kn5,
                kn5_file: Some(kn5_name.clone()),
                skin_folder: None,
                category,
                width,
                height,
                format,
                preview_url,
                is_decoded: true,
                replacement: None,
            };
            let _ = app.emit("decode-texture", &tex);
        }
    }

    if cancel.0.load(Ordering::Relaxed) {
        return Ok(());
    }

    let skins_path = path.join("skins");
    if skins_path.is_dir() {
        if let Ok(skin_dirs) = std::fs::read_dir(&skins_path) {
            for skin_entry in skin_dirs.flatten() {
                if cancel.0.load(Ordering::Relaxed) {
                    return Ok(());
                }

                let skin_path = skin_entry.path();
                if !skin_path.is_dir() {
                    continue;
                }
                let skin_name = skin_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                if let Ok(files) = std::fs::read_dir(&skin_path) {
                    for file_entry in files.flatten() {
                        if cancel.0.load(Ordering::Relaxed) {
                            return Ok(());
                        }
                        let fp = file_entry.path();
                        if fp.extension().and_then(|s| s.to_str()) != Some("dds") {
                            continue;
                        }
                        let tex_name = fp
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();
                        if let Ok(data) = std::fs::read(&fp) {
                            let preview_url =
                                dds::generate_thumbnail(&data, 128).unwrap_or_default();
                            let format = dds::detect_format(&data);
                            let (width, height) = dds::parse_dds_dimensions(&data);
                            let tex = TextureEntry {
                                id: Uuid::new_v4().to_string(),
                                name: tex_name,
                                path: fp.to_string_lossy().to_string(),
                                source: TextureSource::Skin,
                                kn5_file: None,
                                skin_folder: Some(skin_name.clone()),
                                category: TextureCategory::Livery,
                                width,
                                height,
                                format,
                                preview_url,
                                is_decoded: true,
                                replacement: None,
                            };
                            let _ = app.emit("decode-texture", &tex);
                        }
                    }
                }
            }
        }
    }

    if mt == ModType::Track {
        for (name, abs_path, rel_path) in collect_hero_png_entries(path) {
            if cancel.0.load(Ordering::Relaxed) {
                return Ok(());
            }
            if let Ok(img) = image::open(&abs_path) {
                let width = img.width();
                let height = img.height();
                let thumb = img.thumbnail(256, 256);
                let mut png_bytes: Vec<u8> = Vec::new();
                let _ = thumb.write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png);
                let b64 = general_purpose::STANDARD.encode(&png_bytes);
                let preview_url = format!("data:image/png;base64,{b64}");
                let tex = TextureEntry {
                    id: Uuid::new_v4().to_string(),
                    name,
                    // Relative path from mod root — used as kn5_path in extract/import
                    path: rel_path,
                    source: TextureSource::Skin,
                    kn5_file: None,
                    skin_folder: None,
                    category: TextureCategory::Preview,
                    width,
                    height,
                    format: "PNG".to_string(),
                    preview_url,
                    is_decoded: true,
                    replacement: None,
                };
                let _ = app.emit("decode-texture", &tex);
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_categorize_car_body() {
        let mt = ModType::Car;
        assert_eq!(categorize("body_paint.dds", &mt), TextureCategory::Body);
        assert_eq!(categorize("ext_diffuse.dds", &mt), TextureCategory::Body);
        assert_eq!(categorize("EXT_HOOD.dds", &mt), TextureCategory::Body);
    }

    #[test]
    fn test_categorize_car_interior() {
        let mt = ModType::Car;
        assert_eq!(
            categorize("interior_dash.dds", &mt),
            TextureCategory::Interior
        );
        assert_eq!(categorize("int_seat.dds", &mt), TextureCategory::Interior);
        assert_eq!(
            categorize("cockpit_glass.dds", &mt),
            TextureCategory::Interior
        );
    }

    #[test]
    fn test_categorize_car_wheels() {
        let mt = ModType::Car;
        assert_eq!(categorize("wheel_rim.dds", &mt), TextureCategory::Wheels);
        assert_eq!(categorize("rim_silver.dds", &mt), TextureCategory::Wheels);
        assert_eq!(categorize("tyre_front.dds", &mt), TextureCategory::Wheels);
    }

    #[test]
    fn test_categorize_car_other() {
        let mt = ModType::Car;
        assert_eq!(categorize("brake_disk.dds", &mt), TextureCategory::Other);
        assert_eq!(categorize("misc_texture.dds", &mt), TextureCategory::Other);
    }

    #[test]
    fn test_categorize_track_road() {
        let mt = ModType::Track;
        assert_eq!(categorize("road_surface.dds", &mt), TextureCategory::Road);
        assert_eq!(categorize("asphalt_01.dds", &mt), TextureCategory::Road);
        assert_eq!(categorize("pavement_edge.dds", &mt), TextureCategory::Road);
    }

    #[test]
    fn test_categorize_track_terrain() {
        let mt = ModType::Track;
        assert_eq!(
            categorize("terrain_base.dds", &mt),
            TextureCategory::Terrain
        );
        assert_eq!(categorize("grass_green.dds", &mt), TextureCategory::Terrain);
        assert_eq!(categorize("dirt_track.dds", &mt), TextureCategory::Terrain);
        assert_eq!(categorize("sand_light.dds", &mt), TextureCategory::Terrain);
    }

    #[test]
    fn test_categorize_track_buildings() {
        let mt = ModType::Track;
        assert_eq!(
            categorize("building_main.dds", &mt),
            TextureCategory::Buildings
        );
        assert_eq!(
            categorize("wall_stone.dds", &mt),
            TextureCategory::Buildings
        );
        assert_eq!(
            categorize("house_roof.dds", &mt),
            TextureCategory::Buildings
        );
    }

    #[test]
    fn test_categorize_track_props() {
        let mt = ModType::Track;
        assert_eq!(categorize("tree_pine.dds", &mt), TextureCategory::Props);
        assert_eq!(categorize("prop_cone.dds", &mt), TextureCategory::Props);
        assert_eq!(categorize("barrier_tyre.dds", &mt), TextureCategory::Props);
        assert_eq!(categorize("fence_chain.dds", &mt), TextureCategory::Props);
    }

    #[test]
    fn test_categorize_track_sky() {
        let mt = ModType::Track;
        assert_eq!(categorize("sky_cloudy.dds", &mt), TextureCategory::Sky);
        assert_eq!(categorize("cloud_white.dds", &mt), TextureCategory::Sky);
    }

    #[test]
    fn test_categorize_track_other() {
        let mt = ModType::Track;
        assert_eq!(categorize("generic_tex.dds", &mt), TextureCategory::Other);
    }

    #[test]
    fn test_parse_dds_dimensions_in_decode() {
        let mut data = vec![0u8; 20];
        data[0..4].copy_from_slice(b"DDS ");
        data[12..16].copy_from_slice(&512u32.to_le_bytes()); // height
        data[16..20].copy_from_slice(&1024u32.to_le_bytes()); // width
        let (w, h) = dds::parse_dds_dimensions(&data);
        assert_eq!(w, 1024);
        assert_eq!(h, 512);
    }

    fn write_tiny_png(path: &std::path::Path) {
        let img = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_fn(64, 64, |_, _| {
            image::Rgba([0, 0, 0, 255])
        }));
        img.save(path).unwrap();
    }

    #[test]
    fn test_collect_hero_png_entries_single_layout_root() {
        let tmp = tempfile::tempdir().unwrap();
        write_tiny_png(&tmp.path().join("preview.png"));

        let entries = collect_hero_png_entries(tmp.path());
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].0, "preview.png");
        assert_eq!(entries[0].2, "preview.png");
    }

    #[test]
    fn test_collect_hero_png_entries_single_layout_ui_subdir() {
        let tmp = tempfile::tempdir().unwrap();
        let ui = tmp.path().join("ui");
        std::fs::create_dir(&ui).unwrap();
        write_tiny_png(&ui.join("preview.png"));

        let entries = collect_hero_png_entries(tmp.path());
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].0, "preview.png");
        assert_eq!(entries[0].2, "ui/preview.png");
    }

    #[test]
    fn test_collect_hero_png_entries_multi_layout() {
        let tmp = tempfile::tempdir().unwrap();
        let ui = tmp.path().join("ui");
        std::fs::create_dir(&ui).unwrap();
        for layout in ["boot", "national"] {
            let dir = ui.join(layout);
            std::fs::create_dir(&dir).unwrap();
            write_tiny_png(&dir.join("preview.png"));
        }

        let entries = collect_hero_png_entries(tmp.path());
        assert_eq!(entries.len(), 2);
        let names: Vec<&str> = entries.iter().map(|(n, _, _)| n.as_str()).collect();
        let rels: Vec<&str> = entries.iter().map(|(_, _, r)| r.as_str()).collect();
        assert!(names.contains(&"preview_boot.png"));
        assert!(names.contains(&"preview_national.png"));
        assert!(rels.contains(&"ui/boot/preview.png"));
        assert!(rels.contains(&"ui/national/preview.png"));
    }

    #[test]
    fn test_collect_hero_png_entries_no_file() {
        let tmp = tempfile::tempdir().unwrap();
        let entries = collect_hero_png_entries(tmp.path());
        assert!(entries.is_empty());
    }

    #[test]
    fn test_collect_hero_png_entries_single_layout_subdir_uses_preview_name() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("ui").join("boot");
        std::fs::create_dir_all(&dir).unwrap();
        write_tiny_png(&dir.join("preview.png"));

        // Single layout subdir → display name "preview.png", rel "ui/boot/preview.png"
        let entries = collect_hero_png_entries(tmp.path());
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].0, "preview.png");
        assert_eq!(entries[0].2, "ui/boot/preview.png");
    }
}
