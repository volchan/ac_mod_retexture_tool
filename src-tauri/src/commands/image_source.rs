//! What the frontend is allowed to hand back as a file to read.
//!
//! Every replacement image the user picks lives wherever they keep their
//! artwork, so the toolkit cannot confine these paths to a directory of its
//! own. What it can do is refuse anything that is not an image it would decode:
//! the path arrives over IPC, and commands that read one hand the bytes back to
//! the webview, so an unchecked path turns any file the process can open into
//! something the frontend can fetch.

use std::path::Path;

use crate::errors::AppError;

// SVG is readable here because the editor only ever draws it into a canvas as an
// image, where a document's scripts and external references never run.
pub const ALLOWED_IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp", "dds", "svg"];
pub const MAX_IMAGE_BYTES: u64 = 64 * 1024 * 1024;

/// Whether this path is one a command may read and serve back.
pub fn is_readable_image(path: &Path) -> bool {
    ensure_readable_image(path).is_ok()
}

/// The same check, saying what was wrong with the path rather than only that
/// something was.
pub fn ensure_readable_image(path: &Path) -> Result<(), AppError> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    if !ALLOWED_IMAGE_EXTS.contains(&ext.as_str()) {
        return Err(AppError::InvalidInput(format!(
            "unsupported file type: {ext}"
        )));
    }

    // Named rather than passed through: a car holds sixty textures, and a bare
    // "No such file or directory" leaves the one that went missing unnamed.
    let size = std::fs::metadata(path)
        .map_err(|e| AppError::InvalidInput(format!("cannot read {}: {e}", path.display())))?
        .len();
    if size > MAX_IMAGE_BYTES {
        return Err(AppError::InvalidInput(format!(
            "file too large: {size} bytes (max 64 MB)"
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(dir: &Path, name: &str, bytes: usize) -> std::path::PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, vec![0u8; bytes]).unwrap();
        path
    }

    #[test]
    fn an_image_the_toolkit_decodes_is_readable() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["skin.png", "SKIN.PNG", "hero.jpeg", "body.dds"] {
            assert!(is_readable_image(&file(dir.path(), name, 8)), "{name}");
        }
    }

    /// The point of the check: a path the frontend supplies must not be able to
    /// name something that is not artwork.
    #[test]
    fn anything_that_is_not_an_image_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["secrets.env", "id_rsa", "notes", "archive.zip"] {
            assert!(!is_readable_image(&file(dir.path(), name, 8)), "{name}");
        }
    }

    #[test]
    fn a_missing_file_is_refused_even_with_the_right_extension() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!is_readable_image(&dir.path().join("absent.png")));
    }

    #[test]
    fn an_image_past_the_size_cap_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let path = file(dir.path(), "huge.png", 0);
        std::fs::File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_len(MAX_IMAGE_BYTES + 1)
            .unwrap();

        assert!(!is_readable_image(&path));
    }
}
