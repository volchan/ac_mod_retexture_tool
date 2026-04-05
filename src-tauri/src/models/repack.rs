use serde::{Deserialize, Serialize};
use super::mod_info::{CarMeta, ModMeta, TrackMeta};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureReplacementOpt {
    pub texture_id: String,
    pub source_path: String,
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
        };
        let json = serde_json::to_string(&opt).unwrap();
        let back: TextureReplacementOpt = serde_json::from_str(&json).unwrap();
        assert_eq!(back.texture_id, opt.texture_id);
        assert_eq!(back.source_path, opt.source_path);
    }

    #[test]
    fn repack_options_round_trips() {
        let opts = RepackOptions {
            mod_path: "/mods/ferrari_488".to_string(),
            output_path: "/output/ferrari_488_retextured".to_string(),
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
            }],
        };
        let json = serde_json::to_string(&opts).unwrap();
        let back: RepackOptions = serde_json::from_str(&json).unwrap();
        assert_eq!(back.mod_path, opts.mod_path);
        assert_eq!(back.replacements.len(), 1);
        assert!(back.car_meta.is_none());
    }
}
