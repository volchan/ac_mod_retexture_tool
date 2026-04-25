pub fn parse_library_paths(content: &str) -> Vec<String> {
    let mut paths = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(path) = extract_path_value(trimmed) {
            paths.push(path);
        }
    }

    paths
}

fn extract_path_value(line: &str) -> Option<String> {
    let line = line.trim_start_matches('"');
    if !line.starts_with("path\"") {
        return None;
    }
    let after_key = line["path\"".len()..].trim();
    let value = after_key.trim_start_matches('"');
    let end = value.find('"')?;
    let path = &value[..end];
    if path.is_empty() {
        return None;
    }
    let normalized = path.replace("\\\\", "\\");
    if cfg!(target_os = "windows") {
        Some(normalized.replace('/', "\\"))
    } else {
        Some(normalized)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_vdf_library_paths() {
        let vdf = r#"
"libraryfolders"
{
    "1"
    {
        "path"    "D:\\SteamLibrary"
        "label"   ""
    }
    "2"
    {
        "path"    "E:\\Games"
        "label"   ""
    }
}
"#;
        let paths = parse_library_paths(vdf);
        assert_eq!(paths.len(), 2);
        assert_eq!(paths[0], "D:\\SteamLibrary");
        assert_eq!(paths[1], "E:\\Games");
    }

    #[test]
    fn test_parse_vdf_empty_content() {
        let paths = parse_library_paths("");
        assert!(paths.is_empty());
    }

    #[test]
    fn test_parse_vdf_no_paths() {
        let paths = parse_library_paths(r#""libraryfolders" { "1" { "label" "" } }"#);
        assert!(paths.is_empty());
    }
}
