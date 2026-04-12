use super::mod_info::{CarMeta, ModMeta, TrackMeta};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureReplacementOpt {
    pub texture_id: String,
    pub source_path: String,
    pub kn5_file: Option<String>,
    pub texture_name: String,
    pub skin_folder: Option<String>,
    pub original_format: String,
    /// Relative path from mod root for hero images (e.g. "ui/preview.png").
    /// When set, the source PNG is copied verbatim to this path in the output.
    pub hero_image_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepackOptions {
    pub mod_path: String,
    pub output_path: String,
    pub meta: ModMeta,
    pub car_meta: Option<CarMeta>,
    pub track_meta: Option<TrackMeta>,
    pub replacements: Vec<TextureReplacementOpt>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn texture_replacement_opt_round_trips() {
        let opt = TextureReplacementOpt {
            texture_id: "tex_001".to_string(),
            source_path: "/new/texture.png".to_string(),
            kn5_file: Some("/mods/car/car.kn5".to_string()),
            texture_name: "body_main.dds".to_string(),
            skin_folder: None,
            original_format: "BC3".to_string(),
            hero_image_path: None,
        };
        let json = serde_json::to_string(&opt).unwrap();
        let back: TextureReplacementOpt = serde_json::from_str(&json).unwrap();
        assert_eq!(back.texture_id, opt.texture_id);
        assert_eq!(back.source_path, opt.source_path);
        assert_eq!(back.texture_name, opt.texture_name);
        assert_eq!(back.original_format, opt.original_format);
        assert_eq!(back.kn5_file, opt.kn5_file);
        assert!(back.skin_folder.is_none());
    }

    #[test]
    fn texture_replacement_opt_skin_round_trips() {
        let opt = TextureReplacementOpt {
            texture_id: "skin_tex".to_string(),
            source_path: "/new/livery.png".to_string(),
            kn5_file: None,
            texture_name: "livery.dds".to_string(),
            skin_folder: Some("skin_01".to_string()),
            original_format: "BC1".to_string(),
            hero_image_path: None,
        };
        let json = serde_json::to_string(&opt).unwrap();
        let back: TextureReplacementOpt = serde_json::from_str(&json).unwrap();
        assert!(back.kn5_file.is_none());
        assert_eq!(back.skin_folder.as_deref(), Some("skin_01"));
    }

    #[test]
    fn repack_options_round_trips() {
        let opts = RepackOptions {
            mod_path: "/mods/ferrari_488".to_string(),
            output_path: "/output/ferrari_488_retextured.7z".to_string(),
            meta: ModMeta {
                name: "Ferrari 488".to_string(),
                folder_name: "ferrari_488".to_string(),
                author: "Author".to_string(),
                version: "1.0".to_string(),
                description: "".to_string(),
            },
            car_meta: None,
            track_meta: None,
            replacements: vec![TextureReplacementOpt {
                texture_id: "tex_001".to_string(),
                source_path: "/new/body.png".to_string(),
                kn5_file: Some("/mods/ferrari_488/ferrari_488.kn5".to_string()),
                texture_name: "body_main.dds".to_string(),
                skin_folder: None,
                original_format: "BC3".to_string(),
                hero_image_path: None,
            }],
        };
        let json = serde_json::to_string(&opts).unwrap();
        let back: RepackOptions = serde_json::from_str(&json).unwrap();
        assert_eq!(back.mod_path, opts.mod_path);
        assert_eq!(back.replacements.len(), 1);
        assert!(back.car_meta.is_none());
    }
}
