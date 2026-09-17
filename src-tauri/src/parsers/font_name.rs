//! Reads the family name out of a font file, the way a CSS `font-family` needs
//! it. A file name is not the family name — `HelveticaNeue.ttc` holds a dozen
//! families — so the `name` table is the only reliable source.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Family names a single file offers: one for a plain font, several for a
/// collection.
pub fn family_names(path: &Path) -> Vec<String> {
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

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

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
        .chunks_exact(2)
        .map(|pair| u16::from_be_bytes([pair[0], pair[1]]))
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
