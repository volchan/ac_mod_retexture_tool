use crate::converters::dds;
use crate::models::mod_info::ModType;
use crate::models::texture::{TextureCategory, TextureEntry, TextureSource};
use crate::parsers::kn5::Kn5File;
use std::path::Path;
use tauri::{AppHandle, Emitter};
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

#[tauri::command]
pub async fn decode_mod_textures(
    app: AppHandle,
    mod_path: String,
    mod_type: String,
) -> Result<(), String> {
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
        let kn5_path = entry.path();
        let kn5_name = kn5_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let kn5 = match Kn5File::open(kn5_path) {
            Ok(k) => k,
            Err(e) => {
                let _ = app.emit("decode-error", e.to_string());
                continue;
            }
        };

        for tex_name in kn5.texture_names() {
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

        let _ = app.emit(
            "decode-progress",
            serde_json::json!({
                "current": i + 1,
                "total": total,
                "label": kn5_name,
            }),
        );
    }

    let skins_path = path.join("skins");
    if skins_path.is_dir() {
        if let Ok(skin_dirs) = std::fs::read_dir(&skins_path) {
            for skin_entry in skin_dirs.flatten() {
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
        assert_eq!(categorize("wall_stone.dds", &mt), TextureCategory::Buildings);
        assert_eq!(categorize("house_roof.dds", &mt), TextureCategory::Buildings);
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
}
