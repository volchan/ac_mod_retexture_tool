use serde::{Deserialize, Serialize};

/// One skin folder under `content/cars/<car>/skins/`.
///
/// AC makes no distinction between skins shipped with the car mod and skins
/// installed separately afterwards — both are plain folders here.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkinEntry {
    /// Folder name — this is the id AC uses in `race.ini` SKIN=.
    pub name: String,
    pub path: String,
    /// `skinname` from ui_skin.json, when the skin declares one.
    pub display_name: Option<String>,
    pub driver_name: Option<String>,
    pub team: Option<String>,
    pub number: Option<String>,
    pub preview_url: Option<String>,
    pub texture_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skin_entry_round_trips() {
        let entry = SkinEntry {
            name: "red_01".to_string(),
            path: "/cars/ferrari/skins/red_01".to_string(),
            display_name: Some("Rosso Corsa".to_string()),
            driver_name: Some("Driver".to_string()),
            team: Some("Team".to_string()),
            number: Some("27".to_string()),
            preview_url: Some("data:image/jpeg;base64,abc".to_string()),
            texture_count: 4,
        };
        let json = serde_json::to_string(&entry).unwrap();
        let back: SkinEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(back, entry);
    }

    #[test]
    fn skin_entry_serializes_optional_fields_as_null() {
        let entry = SkinEntry {
            name: "default".to_string(),
            path: "/cars/ferrari/skins/default".to_string(),
            display_name: None,
            driver_name: None,
            team: None,
            number: None,
            preview_url: None,
            texture_count: 0,
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"displayName\":null"));
        assert!(json.contains("\"previewUrl\":null"));
    }
}
