use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcCandidate {
    pub path: String,
    pub label: String,
    pub source: String,
    pub version: Option<String>,
    pub car_count: usize,
    pub track_count: usize,
}

#[derive(Serialize, Deserialize)]
pub struct AcDetectResult {
    pub candidates: Vec<AcCandidate>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcProbeEvent {
    pub path: String,
    pub label: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcInstallInfo {
    pub path: String,
    pub version: Option<String>,
    pub car_count: usize,
    pub track_count: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub id: String,
    pub mod_type: String,
    pub path: String,
    pub name: String,
    pub is_kunos: bool,
    pub author: Option<String>,
    pub texture_count: usize,
    pub brand: Option<String>,
    pub bhp: Option<f64>,
    pub weight: Option<f64>,
    pub year: Option<i64>,
    pub skin_count: Option<usize>,
    pub country: Option<String>,
    pub length: Option<f64>,
    pub pitboxes: Option<i64>,
    pub layouts: Option<usize>,
    pub badge_path: Option<String>,
}
