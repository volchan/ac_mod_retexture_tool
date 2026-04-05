use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Image decode error: {0}")]
    ImageDecode(String),
    #[error("Image encode error: {0}")]
    ImageEncode(String),
    #[error("KN5 parse error: {0}")]
    Kn5Parse(String),
    #[error("ACD decrypt error: {0}")]
    AcdDecrypt(String),
    #[error("Serialize error: {0}")]
    Serialize(String),
    #[error("Not found: {0}")]
    NotFound(String),
}

impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn io_error_converts_to_string() {
        let err = AppError::Io(std::io::Error::new(std::io::ErrorKind::NotFound, "file missing"));
        let s: String = err.into();
        assert!(s.contains("IO error"));
    }

    #[test]
    fn not_found_error_includes_message() {
        let err = AppError::NotFound("test.kn5".to_string());
        let s: String = err.into();
        assert!(s.contains("Not found: test.kn5"));
    }

    #[test]
    fn image_decode_error_includes_message() {
        let err = AppError::ImageDecode("bad header".to_string());
        let s: String = err.into();
        assert!(s.contains("Image decode error: bad header"));
    }

    #[test]
    fn image_encode_error_includes_message() {
        let err = AppError::ImageEncode("unsupported format".to_string());
        let s: String = err.into();
        assert!(s.contains("Image encode error: unsupported format"));
    }

    #[test]
    fn kn5_parse_error_includes_message() {
        let err = AppError::Kn5Parse("unexpected eof".to_string());
        let s: String = err.into();
        assert!(s.contains("KN5 parse error: unexpected eof"));
    }

    #[test]
    fn acd_decrypt_error_includes_message() {
        let err = AppError::AcdDecrypt("invalid key".to_string());
        let s: String = err.into();
        assert!(s.contains("ACD decrypt error: invalid key"));
    }

    #[test]
    fn serialize_error_includes_message() {
        let err = AppError::Serialize("missing field".to_string());
        let s: String = err.into();
        assert!(s.contains("Serialize error: missing field"));
    }
}
