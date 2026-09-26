//! Reads the family name out of a font file, the way a CSS `font-family` needs
//! it. A file name is not the family name — `HelveticaNeue.ttc` holds a dozen
//! families — so the `name` table is the only reliable source.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Family names a single file offers: one for a plain font, several for a
/// collection.
pub fn family_names(path: &Path) -> Vec<String> {
    let names = read_families(path);
    if names.is_empty() {
        // A font folder holds plenty that is not a readable font, so this is a
        // skip rather than a failure — but the font then simply never appears in
        // the editor's list, and nothing else anywhere would say which one.
        eprintln!("Font skipped, no readable family name: {}", path.display());
    }
    names
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

fn read_families(path: &Path) -> Vec<String> {
    let Ok(mut file) = File::open(path) else {
        return vec![];
    };
    let Ok(tag) = read_exact::<4>(&mut file) else {
        return vec![];
    };

    if &tag == b"ttcf" {
        return collection_families(&mut file);
    }
    families_at(&mut file, 0).into_iter().collect()
}

fn collection_families(file: &mut File) -> Vec<String> {
    if file.seek(SeekFrom::Start(8)).is_err() {
        return vec![];
    }
    let Ok(count) = read_u32(file) else {
        return vec![];
    };

    let mut offsets = Vec::new();
    for _ in 0..count.min(64) {
        match read_u32(file) {
            Ok(offset) => offsets.push(offset),
            Err(_) => break,
        }
    }

    offsets
        .into_iter()
        .filter_map(|offset| families_at(file, u64::from(offset)))
        .collect()
}

/// One font's family name, given where its table directory starts.
fn families_at(file: &mut File, start: u64) -> Option<String> {
    file.seek(SeekFrom::Start(start + 4)).ok()?;
    let table_count = read_u16(file).ok()?;
    file.seek(SeekFrom::Current(6)).ok()?; // search range, entry selector, range shift

    let mut name_table: Option<u32> = None;
    for _ in 0..table_count {
        let tag = read_exact::<4>(file).ok()?;
        file.seek(SeekFrom::Current(4)).ok()?; // checksum
        let offset = read_u32(file).ok()?;
        file.seek(SeekFrom::Current(4)).ok()?; // length
        if &tag == b"name" {
            name_table = Some(offset);
            break;
        }
    }

    read_family(file, u64::from(name_table?))
}

/// Name record 1 is the family. Windows records come in UTF-16 and are the ones
/// every modern font ships, so they win over the legacy Macintosh encoding.
fn read_family(file: &mut File, table: u64) -> Option<String> {
    const FAMILY: u16 = 1;
    const UNICODE: u16 = 0;
    const MACINTOSH: u16 = 1;
    const WINDOWS: u16 = 3;

    file.seek(SeekFrom::Start(table)).ok()?;
    let _format = read_u16(file).ok()?;
    let count = read_u16(file).ok()?;
    let strings = u64::from(read_u16(file).ok()?);

    let mut fallback: Option<(u64, u16, u16)> = None;
    let mut preferred: Option<(u64, u16, u16)> = None;

    for _ in 0..count {
        let platform = read_u16(file).ok()?;
        file.seek(SeekFrom::Current(4)).ok()?; // encoding, language
        let name_id = read_u16(file).ok()?;
        let length = read_u16(file).ok()?;
        let offset = u64::from(read_u16(file).ok()?);
        if name_id != FAMILY {
            continue;
        }
        let record = (table + strings + offset, length, platform);
        if platform == WINDOWS {
            preferred = Some(record);
        } else if fallback.is_none() {
            fallback = Some(record);
        }
    }

    let (at, length, platform) = preferred.or(fallback)?;
    file.seek(SeekFrom::Start(at)).ok()?;
    let mut bytes = vec![0u8; usize::from(length)];
    file.read_exact(&mut bytes).ok()?;

    // Only the Macintosh platform uses one byte per character; both Unicode and
    // Windows records are UTF-16, and reading those as bytes spaces every letter.
    let text = if platform == MACINTOSH {
        bytes.iter().map(|b| char::from(*b)).collect()
    } else {
        let _ = UNICODE;
        decode_utf16_be(&bytes)
    };
    let trimmed = text.trim().to_string();
    (!trimmed.is_empty()).then_some(trimmed)
}

fn decode_utf16_be(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| u16::from_be_bytes(*pair))
        .collect();
    String::from_utf16_lossy(&units)
}

fn read_exact<const N: usize>(file: &mut File) -> std::io::Result<[u8; N]> {
    let mut buf = [0u8; N];
    file.read_exact(&mut buf)?;
    Ok(buf)
}

fn read_u16(file: &mut File) -> std::io::Result<u16> {
    Ok(u16::from_be_bytes(read_exact::<2>(file)?))
}

fn read_u32(file: &mut File) -> std::io::Result<u32> {
    Ok(u32::from_be_bytes(read_exact::<4>(file)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    const WINDOWS: u16 = 3;
    const MACINTOSH: u16 = 1;

    /// One `name` table holding the records given, and the table directory that
    /// points at it. Nothing else a font carries is read, so nothing else is
    /// written.
    fn font(records: &[(u16, &str)]) -> Vec<u8> {
        font_at(0, records)
    }

    /// `base` is where this font's directory will sit in the finished file: a
    /// table offset is absolute, so a font inside a collection cannot be built
    /// without knowing it.
    fn font_at(base: usize, records: &[(u16, &str)]) -> Vec<u8> {
        let name_table = name_table(records);
        let mut out = Vec::new();

        out.extend_from_slice(&0x0001_0000u32.to_be_bytes()); // sfnt version
        out.extend_from_slice(&1u16.to_be_bytes()); // one table
        out.extend_from_slice(&[0u8; 6]); // search range, entry selector, range shift

        let table_at = base + out.len() + 16;
        out.extend_from_slice(b"name");
        out.extend_from_slice(&0u32.to_be_bytes()); // checksum
        out.extend_from_slice(&(table_at as u32).to_be_bytes());
        out.extend_from_slice(&(name_table.len() as u32).to_be_bytes());
        out.extend_from_slice(&name_table);
        out
    }

    fn name_table(records: &[(u16, &str)]) -> Vec<u8> {
        const FAMILY: u16 = 1;

        let encoded: Vec<Vec<u8>> = records
            .iter()
            .map(|(platform, value)| encode(*platform, value))
            .collect();
        let strings_at = 6 + records.len() * 12;

        let mut out = Vec::new();
        out.extend_from_slice(&0u16.to_be_bytes()); // format
        out.extend_from_slice(&(records.len() as u16).to_be_bytes());
        out.extend_from_slice(&(strings_at as u16).to_be_bytes());

        let mut offset = 0usize;
        for ((platform, _), bytes) in records.iter().zip(&encoded) {
            out.extend_from_slice(&platform.to_be_bytes());
            out.extend_from_slice(&[0u8; 4]); // encoding, language
            out.extend_from_slice(&FAMILY.to_be_bytes());
            out.extend_from_slice(&(bytes.len() as u16).to_be_bytes());
            out.extend_from_slice(&(offset as u16).to_be_bytes());
            offset += bytes.len();
        }
        for bytes in encoded {
            out.extend_from_slice(&bytes);
        }
        out
    }

    fn encode(platform: u16, value: &str) -> Vec<u8> {
        if platform == MACINTOSH {
            return value.bytes().collect();
        }
        value.encode_utf16().flat_map(u16::to_be_bytes).collect()
    }

    /// A collection wraps several whole fonts and points at each one's directory.
    fn collection(members: &[&[(u16, &str)]]) -> Vec<u8> {
        let mut base = 12 + members.len() * 4;
        let mut fonts = Vec::new();
        let mut offsets = Vec::new();
        for records in members {
            offsets.push(base);
            let font = font_at(base, records);
            base += font.len();
            fonts.push(font);
        }

        let mut out = Vec::new();
        out.extend_from_slice(b"ttcf");
        out.extend_from_slice(&0x0001_0000u32.to_be_bytes()); // version
        out.extend_from_slice(&(members.len() as u32).to_be_bytes());
        for offset in offsets {
            out.extend_from_slice(&(offset as u32).to_be_bytes());
        }
        for font in fonts {
            out.extend_from_slice(&font);
        }
        out
    }

    fn names_of(bytes: &[u8]) -> Vec<String> {
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), bytes).unwrap();
        family_names(file.path())
    }

    #[test]
    fn a_plain_font_gives_up_its_family_name() {
        assert_eq!(names_of(&font(&[(WINDOWS, "Impact")])), vec!["Impact"]);
    }

    /// A file name is not the family name: one collection holds a dozen.
    #[test]
    fn a_collection_gives_up_every_family_it_holds() {
        let bytes = collection(&[&[(WINDOWS, "Helvetica Neue")], &[(WINDOWS, "Helvetica")]]);

        assert_eq!(names_of(&bytes), vec!["Helvetica Neue", "Helvetica"]);
    }

    /// Both records name the same family, and reading the UTF-16 one as bytes
    /// spaces every letter: the Windows record is the one modern fonts mean.
    #[test]
    fn a_windows_record_wins_over_the_legacy_macintosh_one() {
        let bytes = font(&[(MACINTOSH, "Legacy Name"), (WINDOWS, "Modern Name")]);

        assert_eq!(names_of(&bytes), vec!["Modern Name"]);
    }

    #[test]
    fn a_macintosh_record_is_read_when_it_is_all_there_is() {
        assert_eq!(names_of(&font(&[(MACINTOSH, "Chicago")])), vec!["Chicago"]);
    }

    #[test]
    fn utf16_is_decoded_rather_than_read_as_bytes() {
        assert_eq!(decode_utf16_be(&[0x00, 0x41, 0x00, 0x42]), "AB");
        assert_eq!(decode_utf16_be(&[0x00, 0xe9]), "é");
    }

    /// A trailing odd byte is not half of anything, and dropping it beats
    /// panicking on the slice.
    #[test]
    fn a_dangling_byte_is_dropped_rather_than_decoded() {
        assert_eq!(decode_utf16_be(&[0x00, 0x41, 0x00]), "A");
        assert_eq!(decode_utf16_be(&[]), "");
    }

    #[test]
    fn a_name_that_is_only_whitespace_counts_as_no_name() {
        assert!(names_of(&font(&[(WINDOWS, "   ")])).is_empty());
    }

    #[test]
    fn a_family_name_is_trimmed() {
        assert_eq!(names_of(&font(&[(WINDOWS, "  Impact  ")])), vec!["Impact"]);
    }

    #[test]
    fn a_font_carrying_no_name_table_yields_nothing() {
        let mut bytes = font(&[(WINDOWS, "Impact")]);
        bytes[12..16].copy_from_slice(b"glyf");

        assert!(names_of(&bytes).is_empty());
    }

    #[test]
    fn a_file_that_is_not_a_font_yields_nothing() {
        assert!(names_of(b"just some bytes").is_empty());
    }

    #[test]
    fn a_missing_file_yields_nothing() {
        assert!(family_names(Path::new("/nowhere/absent.ttf")).is_empty());
    }
}
