use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ModType {
    Car,
    Track,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModMeta {
    pub name: String,
    pub folder_name: String,
    pub author: String,
    pub version: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CarMeta {
    pub brand: String,
    pub car_class: String,
    pub bhp: f32,
    pub weight: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMeta {
    pub country: String,
    pub length: f32,
    pub pitboxes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModFileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub file_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinFolder {
    pub name: String,
    pub path: String,
    pub files: Vec<ModFileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModManifest {
    pub mod_type: ModType,
    pub path: String,
    pub meta: ModMeta,
    pub car_meta: Option<CarMeta>,
    pub track_meta: Option<TrackMeta>,
    pub files: Vec<ModFileEntry>,
    pub kn5_files: Vec<String>,
    pub skin_folders: Vec<SkinFolder>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mod_type_car_serializes_correctly() {
        let json = serde_json::to_string(&ModType::Car).unwrap();
        assert_eq!(json, "\"car\"");
        let back: ModType = serde_json::from_str(&json).unwrap();
        assert_eq!(back, ModType::Car);
    }

    #[test]
    fn mod_type_track_serializes_correctly() {
        let json = serde_json::to_string(&ModType::Track).unwrap();
        assert_eq!(json, "\"track\"");
        let back: ModType = serde_json::from_str(&json).unwrap();
        assert_eq!(back, ModType::Track);
    }

    #[test]
    fn mod_meta_round_trips() {
        let meta = ModMeta {
            name: "Ferrari 488".to_string(),
            folder_name: "ferrari_488".to_string(),
            author: "Test Author".to_string(),
            version: "1.0".to_string(),
            description: "A car mod".to_string(),
        };
        let json = serde_json::to_string(&meta).unwrap();
        let back: ModMeta = serde_json::from_str(&json).unwrap();
        assert_eq!(back.name, meta.name);
        assert_eq!(back.folder_name, meta.folder_name);
    }

    #[test]
    fn car_meta_round_trips() {
        let meta = CarMeta {
            brand: "Ferrari".to_string(),
            car_class: "GT3".to_string(),
            bhp: 550.0,
            weight: 1300.0,
        };
        let json = serde_json::to_string(&meta).unwrap();
        let back: CarMeta = serde_json::from_str(&json).unwrap();
        assert_eq!(back.brand, meta.brand);
        assert_eq!(back.bhp, meta.bhp);
    }

    #[test]
    fn track_meta_round_trips() {
        let meta = TrackMeta {
            country: "Italy".to_string(),
            length: 5.0,
            pitboxes: 30,
        };
        let json = serde_json::to_string(&meta).unwrap();
        let back: TrackMeta = serde_json::from_str(&json).unwrap();
        assert_eq!(back.country, meta.country);
        assert_eq!(back.pitboxes, meta.pitboxes);
    }

    #[test]
    fn mod_manifest_with_optional_fields_round_trips() {
        let manifest = ModManifest {
            mod_type: ModType::Car,
            path: "/mods/ferrari_488".to_string(),
            meta: ModMeta {
                name: "Ferrari 488".to_string(),
                folder_name: "ferrari_488".to_string(),
                author: "Author".to_string(),
                version: "1.0".to_string(),
                description: "".to_string(),
            },
            car_meta: Some(CarMeta {
                brand: "Ferrari".to_string(),
                car_class: "GT3".to_string(),
                bhp: 550.0,
                weight: 1300.0,
            }),
            track_meta: None,
            files: vec![],
            kn5_files: vec!["car.kn5".to_string()],
            skin_folders: vec![],
        };
        let json = serde_json::to_string(&manifest).unwrap();
        let back: ModManifest = serde_json::from_str(&json).unwrap();
        assert_eq!(back.mod_type, ModType::Car);
        assert!(back.car_meta.is_some());
        assert!(back.track_meta.is_none());
    }
}
