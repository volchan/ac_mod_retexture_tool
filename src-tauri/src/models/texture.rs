use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum TextureSource {
    Kn5,
    Skin,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum TextureCategory {
    All,
    Body,
    Livery,
    Interior,
    Wheels,
    Road,
    Terrain,
    Buildings,
    Props,
    Sky,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureReplacement {
    pub source_path: String,
    pub preview_url: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub source: TextureSource,
    pub kn5_file: Option<String>,
    pub skin_folder: Option<String>,
    pub category: TextureCategory,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub preview_url: String,
    pub is_decoded: bool,
    pub replacement: Option<TextureReplacement>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn texture_source_kn5_serializes_correctly() {
        let json = serde_json::to_string(&TextureSource::Kn5).unwrap();
        assert_eq!(json, "\"kn5\"");
        let back: TextureSource = serde_json::from_str(&json).unwrap();
        assert_eq!(back, TextureSource::Kn5);
    }

    #[test]
    fn texture_source_skin_serializes_correctly() {
        let json = serde_json::to_string(&TextureSource::Skin).unwrap();
        assert_eq!(json, "\"skin\"");
        let back: TextureSource = serde_json::from_str(&json).unwrap();
        assert_eq!(back, TextureSource::Skin);
    }

    #[test]
    fn texture_category_variants_serialize_correctly() {
        let cases = [
            (TextureCategory::All, "\"all\""),
            (TextureCategory::Body, "\"body\""),
            (TextureCategory::Livery, "\"livery\""),
            (TextureCategory::Interior, "\"interior\""),
            (TextureCategory::Wheels, "\"wheels\""),
            (TextureCategory::Road, "\"road\""),
            (TextureCategory::Terrain, "\"terrain\""),
            (TextureCategory::Buildings, "\"buildings\""),
            (TextureCategory::Props, "\"props\""),
            (TextureCategory::Sky, "\"sky\""),
            (TextureCategory::Other, "\"other\""),
        ];
        for (variant, expected) in cases {
            let json = serde_json::to_string(&variant).unwrap();
            assert_eq!(json, expected);
        }
    }

    #[test]
    fn texture_entry_round_trips() {
        let entry = TextureEntry {
            id: "tex_001".to_string(),
            name: "body_paint.dds".to_string(),
            path: "/textures/body_paint.dds".to_string(),
            source: TextureSource::Kn5,
            kn5_file: Some("car.kn5".to_string()),
            skin_folder: None,
            category: TextureCategory::Body,
            width: 2048,
            height: 2048,
            format: "DXT5".to_string(),
            preview_url: "data:image/png;base64,abc".to_string(),
            is_decoded: true,
            replacement: None,
        };
        let json = serde_json::to_string(&entry).unwrap();
        let back: TextureEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, entry.id);
        assert_eq!(back.source, TextureSource::Kn5);
        assert_eq!(back.category, TextureCategory::Body);
        assert!(back.skin_folder.is_none());
    }

    #[test]
    fn texture_replacement_round_trips() {
        let replacement = TextureReplacement {
            source_path: "/new/texture.png".to_string(),
            preview_url: "data:image/png;base64,xyz".to_string(),
            width: 1024,
            height: 1024,
        };
        let json = serde_json::to_string(&replacement).unwrap();
        let back: TextureReplacement = serde_json::from_str(&json).unwrap();
        assert_eq!(back.source_path, replacement.source_path);
        assert_eq!(back.width, replacement.width);
    }
}
