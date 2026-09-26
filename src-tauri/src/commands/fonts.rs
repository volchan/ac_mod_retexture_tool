use std::collections::BTreeSet;
use std::path::PathBuf;

use crate::parsers::font_name::family_names;

const FONT_EXTENSIONS: &[&str] = &["ttf", "otf", "ttc", "otc"];

/// Every font family installed on this machine, so the editor offers what the
/// author actually has rather than a list of safe guesses.
#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(scan_fonts)
        .await
        .map_err(|e| e.to_string())
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

pub fn scan_fonts() -> Vec<String> {
    let mut families: BTreeSet<String> = BTreeSet::new();

    for directory in font_directories() {
        let walker = walkdir::WalkDir::new(directory)
            .max_depth(4)
            .into_iter()
            .filter_map(Result::ok);

        for entry in walker.filter(|e| e.file_type().is_file()) {
            if !is_font_file(entry.path()) {
                continue;
            }
            families.extend(
                family_names(entry.path())
                    .into_iter()
                    .filter(|f| is_offerable(f)),
            );
        }
    }

    families.into_iter().collect()
}

/// Apple marks its internal interface faces with a leading dot; they are not
/// meant to be chosen, and half of them render as fallback glyphs anyway.
fn is_offerable(family: &str) -> bool {
    !family.starts_with('.')
}

fn is_font_file(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .is_some_and(|e| FONT_EXTENSIONS.contains(&e.as_str()))
}

/// Where each platform keeps fonts the webview can already render by name.
fn font_directories() -> Vec<PathBuf> {
    let home = dirs::home_dir();

    #[cfg(target_os = "macos")]
    let roots = vec![
        PathBuf::from("/System/Library/Fonts"),
        PathBuf::from("/Library/Fonts"),
        home.map(|h| h.join("Library/Fonts")).unwrap_or_default(),
    ];

    #[cfg(target_os = "windows")]
    let roots = vec![
        PathBuf::from(r"C:\Windows\Fonts"),
        dirs::data_local_dir()
            .map(|d| d.join(r"Microsoft\Windows\Fonts"))
            .unwrap_or_default(),
        home.map(|h| h.join("AppData/Local/Microsoft/Windows/Fonts"))
            .unwrap_or_default(),
    ];

    #[cfg(all(unix, not(target_os = "macos")))]
    let roots = vec![
        PathBuf::from("/usr/share/fonts"),
        PathBuf::from("/usr/local/share/fonts"),
        home.clone().map(|h| h.join(".fonts")).unwrap_or_default(),
        home.map(|h| h.join(".local/share/fonts"))
            .unwrap_or_default(),
    ];

    roots.into_iter().filter(|p| p.is_dir()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn font_directories_all_exist() {
        for directory in font_directories() {
            assert!(
                directory.is_dir(),
                "{} is not a directory",
                directory.display()
            );
        }
    }

    #[test]
    fn apple_internal_faces_are_hidden() {
        assert!(!is_offerable(".Helvetica Neue Interface"));
        assert!(is_offerable("Helvetica Neue"));
    }

    #[test]
    fn only_font_extensions_are_read() {
        assert!(is_font_file(std::path::Path::new("/a/Impact.ttf")));
        assert!(is_font_file(std::path::Path::new("/a/Helvetica.TTC")));
        assert!(!is_font_file(std::path::Path::new("/a/notes.txt")));
        assert!(!is_font_file(std::path::Path::new("/a/noext")));
    }
}
