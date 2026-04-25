mod library;
mod types;
mod validate;
pub mod vdf;

pub use types::{AcCandidate, AcDetectResult, AcInstallInfo, AcProbeEvent, LibraryEntry};

use library::{build_car_entry, build_track_entry, walk_content_dir};
use tauri::Emitter;
use validate::validate_path;

const EVENT_AC_LIBRARY_ENTRY: &str = "ac-library-entry";

#[cfg(target_os = "windows")]
const EVENT_AC_PROBE: &str = "ac-probe";

#[cfg(target_os = "windows")]
const PROBE_STATUS_ACTIVE: &str = "active";

#[cfg(target_os = "windows")]
const PROBE_STATUS_HIT: &str = "hit";

#[cfg(target_os = "windows")]
const PROBE_STATUS_MISS: &str = "miss";

#[cfg(target_os = "windows")]
const AC_SUBPATH: &str = "steamapps\\common\\assettocorsa";

#[cfg(target_os = "windows")]
const SOURCE_AUTO: &str = "auto";

#[cfg(target_os = "windows")]
const SOURCE_ENV: &str = "env";

#[tauri::command]
pub async fn detect_ac_install(app: tauri::AppHandle) -> AcDetectResult {
    #[cfg(target_os = "windows")]
    return windows::probe_all(app).await;

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        AcDetectResult { candidates: vec![] }
    }
}

#[tauri::command]
pub async fn validate_ac_folder(path: String) -> Result<AcInstallInfo, String> {
    tokio::task::spawn_blocking(move || validate_path(&path))
        .await
        .map_err(|e| format!("Task failed: {e}"))?
}

#[tauri::command]
pub async fn list_ac_content(
    app: tauri::AppHandle,
    path: String,
) -> Result<Vec<LibraryEntry>, String> {
    let root = std::path::PathBuf::from(&path);

    let entries = tokio::task::spawn_blocking(move || {
        let cars_dir = root.join("content/cars");
        let tracks_dir = root.join("content/tracks");

        if !cars_dir.is_dir() {
            return Err("Missing: content/cars".to_string());
        }
        if !tracks_dir.is_dir() {
            return Err("Missing: content/tracks".to_string());
        }

        let mut entries: Vec<LibraryEntry> = Vec::new();
        for (id, folder_path) in walk_content_dir(&cars_dir) {
            let entry = build_car_entry(&id, &folder_path);
            let _ = app.emit(EVENT_AC_LIBRARY_ENTRY, &entry);
            entries.push(entry);
        }
        for (id, folder_path) in walk_content_dir(&tracks_dir) {
            let entry = build_track_entry(&id, &folder_path);
            let _ = app.emit(EVENT_AC_LIBRARY_ENTRY, &entry);
            entries.push(entry);
        }
        Ok::<Vec<LibraryEntry>, String>(entries)
    })
    .await
    .map_err(|e| format!("Task failed: {e}"))??;

    Ok(entries)
}

#[cfg(target_os = "windows")]
mod windows {
    use std::time::Duration;

    use tauri::Emitter;
    use tokio::time::timeout;
    use winreg::{enums::*, RegKey};

    use super::{
        AcCandidate, AcDetectResult, AcProbeEvent, AC_SUBPATH, EVENT_AC_PROBE, PROBE_STATUS_ACTIVE,
        PROBE_STATUS_HIT, PROBE_STATUS_MISS, SOURCE_AUTO, SOURCE_ENV,
    };
    use crate::commands::ac_detect::validate::validate_path;

    const PROBE_TIMEOUT_SECS: u64 = 2;
    const ENV_AC_PATH: &str = "ACTOOLKIT_AC_PATH";
    const REG_HKCU_STEAM: &str = "Software\\Valve\\Steam";
    const REG_HKLM_STEAM: &str = "SOFTWARE\\WOW6432Node\\Valve\\Steam";
    const REG_AC_STANDALONE: &str = "SOFTWARE\\WOW6432Node\\Kunos Simulazioni\\Assetto Corsa";
    const VDF_LIBRARY_FOLDERS: &str = "steamapps/libraryfolders.vdf";

    pub async fn probe_all(app: tauri::AppHandle) -> AcDetectResult {
        if let Ok(env_path) = std::env::var(ENV_AC_PATH) {
            if !env_path.is_empty() {
                let label = "Environment variable".to_string();
                emit_probe(&app, &env_path, &label, PROBE_STATUS_ACTIVE);
                if let Ok(info) = probe_with_timeout(&env_path).await {
                    emit_probe(&app, &env_path, &label, PROBE_STATUS_HIT);
                    return AcDetectResult {
                        candidates: vec![AcCandidate {
                            path: env_path,
                            label,
                            source: SOURCE_ENV.to_string(),
                            version: info.version,
                            car_count: info.car_count,
                            track_count: info.track_count,
                        }],
                    };
                }
                emit_probe(&app, &env_path, &label, PROBE_STATUS_MISS);
            }
        }

        let mut static_candidates: Vec<(String, String)> = Vec::new();

        if let Ok(p) = std::env::var("ProgramFiles(x86)") {
            static_candidates.push((
                format!("{p}\\Steam\\{AC_SUBPATH}"),
                "Steam (default)".to_string(),
            ));
        }
        if let Ok(p) = std::env::var("ProgramFiles") {
            static_candidates.push((
                format!("{p}\\Steam\\{AC_SUBPATH}"),
                "Steam (x64)".to_string(),
            ));
        }

        let mut steam_roots: Vec<String> = Vec::new();

        if let Some(path) = read_registry_string(HKEY_CURRENT_USER, REG_HKCU_STEAM, "SteamPath") {
            let normalized = path.replace('/', "\\");
            static_candidates.push((
                format!("{normalized}\\{AC_SUBPATH}"),
                "Steam (registry)".to_string(),
            ));
            steam_roots.push(normalized);
        }

        if let Some(path) = read_registry_string(HKEY_LOCAL_MACHINE, REG_HKLM_STEAM, "InstallPath")
        {
            let normalized = path.replace('/', "\\");
            static_candidates.push((
                format!("{normalized}\\{AC_SUBPATH}"),
                "Steam (HKLM)".to_string(),
            ));
            steam_roots.push(normalized);
        }

        for steam_root in &steam_roots {
            let vdf_path = std::path::Path::new(steam_root).join(VDF_LIBRARY_FOLDERS);
            let vdf_path_owned = vdf_path.to_path_buf();
            let content =
                tokio::task::spawn_blocking(move || std::fs::read_to_string(vdf_path_owned))
                    .await
                    .ok()
                    .and_then(|r| r.ok());
            if let Some(content) = content {
                for lib_path in super::vdf::parse_library_paths(&content) {
                    static_candidates.push((
                        format!("{lib_path}\\{AC_SUBPATH}"),
                        format!("Steam library {lib_path}"),
                    ));
                }
            }
        }

        let drive_candidates = tokio::task::spawn_blocking(|| {
            let mut candidates = Vec::new();
            for drive in b'C'..=b'Z' {
                let letter = drive as char;
                let drive_root = format!("{letter}:\\");
                if std::path::Path::new(&drive_root).exists() {
                    candidates.push((
                        format!("{letter}:\\SteamLibrary\\{AC_SUBPATH}"),
                        format!("Drive {letter}:"),
                    ));
                }
            }
            candidates
        })
        .await
        .unwrap_or_default();
        static_candidates.extend(drive_candidates);

        if let Some(path) =
            read_registry_string(HKEY_LOCAL_MACHINE, REG_AC_STANDALONE, "InstallPath")
        {
            static_candidates.push((path, "Standalone".to_string()));
        }

        let mut candidates: Vec<AcCandidate> = Vec::new();

        for (path, label) in static_candidates {
            emit_probe(&app, &path, &label, PROBE_STATUS_ACTIVE);
            if let Ok(info) = probe_with_timeout(&path).await {
                emit_probe(&app, &path, &label, PROBE_STATUS_HIT);
                candidates.push(AcCandidate {
                    path,
                    label,
                    source: SOURCE_AUTO.to_string(),
                    version: info.version,
                    car_count: info.car_count,
                    track_count: info.track_count,
                });
            } else {
                emit_probe(&app, &path, &label, PROBE_STATUS_MISS);
            }
        }

        AcDetectResult { candidates }
    }

    async fn probe_with_timeout(
        path: &str,
    ) -> Result<crate::commands::ac_detect::AcInstallInfo, ()> {
        let p = path.to_string();
        timeout(Duration::from_secs(PROBE_TIMEOUT_SECS), async move {
            tokio::task::spawn_blocking(move || validate_path(&p).map_err(|_| ()))
                .await
                .map_err(|_| ())?
        })
        .await
        .map_err(|_| ())?
    }

    fn emit_probe(app: &tauri::AppHandle, path: &str, label: &str, status: &str) {
        let _ = app.emit(
            EVENT_AC_PROBE,
            AcProbeEvent {
                path: path.to_string(),
                label: label.to_string(),
                status: status.to_string(),
            },
        );
    }

    fn read_registry_string(hive: isize, subkey: &str, value: &str) -> Option<String> {
        RegKey::predef(hive)
            .open_subkey(subkey)
            .ok()
            .and_then(|key| key.get_value::<String, _>(value).ok())
    }
}
