use std::io::{Cursor, Read, Write};
use std::path::Path;

pub struct TextureSlot {
    pub name: String,
    pub data: Vec<u8>,
    pub offset: u64,
    pub size: u32,
}

pub struct Kn5File {
    pub path: String,
    pub version: u32,
    pub textures: Vec<TextureSlot>,
    raw: Vec<u8>,
    texture_section_end: usize,
}

impl Kn5File {
    pub fn open(path: &Path) -> Result<Self, crate::errors::AppError> {
        let raw = std::fs::read(path)?;
        let mut cursor = Cursor::new(&raw);

        let mut magic = [0u8; 6];
        cursor
            .read_exact(&mut magic)
            .map_err(|e| crate::errors::AppError::Kn5Parse(e.to_string()))?;
        if &magic != b"sc6969" {
            return Err(crate::errors::AppError::Kn5Parse(
                "invalid KN5 magic".to_string(),
            ));
        }

        let version = read_u32_le(&mut cursor)?;
        let _unknown = read_u32_le(&mut cursor)?;
        if version > 5 {
            let _extra = read_u32_le(&mut cursor)?;
        }

        let texture_count = read_u32_le(&mut cursor)?;
        let mut textures = Vec::with_capacity(texture_count as usize);

        for _ in 0..texture_count {
            let _active = read_u32_le(&mut cursor)?;
            let name_len = read_u32_le(&mut cursor)?;
            let mut name_bytes = vec![0u8; name_len as usize];
            cursor
                .read_exact(&mut name_bytes)
                .map_err(|e| crate::errors::AppError::Kn5Parse(e.to_string()))?;
            let name = String::from_utf8(name_bytes)
                .map_err(|e| crate::errors::AppError::Kn5Parse(e.to_string()))?;

            let data_len = read_u32_le(&mut cursor)?;
            let offset = cursor.position();
            let mut data = vec![0u8; data_len as usize];
            cursor
                .read_exact(&mut data)
                .map_err(|e| crate::errors::AppError::Kn5Parse(e.to_string()))?;

            textures.push(TextureSlot {
                name,
                data,
                offset,
                size: data_len,
            });
        }

        let texture_section_end = cursor.position() as usize;

        Ok(Kn5File {
            path: path.to_string_lossy().to_string(),
            version,
            textures,
            raw,
            texture_section_end,
        })
    }

    pub fn texture_names(&self) -> Vec<&str> {
        self.textures.iter().map(|t| t.name.as_str()).collect()
    }

    pub fn get_texture_data(&self, name: &str) -> Option<&[u8]> {
        self.textures
            .iter()
            .find(|t| t.name == name)
            .map(|t| t.data.as_slice())
    }

    pub fn replace_texture_data(
        &mut self,
        name: &str,
        data: Vec<u8>,
    ) -> Result<(), crate::errors::AppError> {
        let slot = self
            .textures
            .iter_mut()
            .find(|t| t.name == name)
            .ok_or_else(|| crate::errors::AppError::NotFound(name.to_string()))?;
        slot.size = data.len() as u32;
        slot.data = data;
        Ok(())
    }

    pub fn save(&self, path: &Path) -> Result<(), crate::errors::AppError> {
        let mut out: Vec<u8> = Vec::new();

        out.write_all(b"sc6969")
            .map_err(crate::errors::AppError::Io)?;
        write_u32_le(&mut out, self.version)?;

        let version_prefix_len = 6 + 4;
        let unknown_val =
            u32::from_le_bytes(self.raw[version_prefix_len..version_prefix_len + 4].try_into().unwrap_or([0; 4]));
        write_u32_le(&mut out, unknown_val)?;

        if self.version > 5 {
            let extra_offset = version_prefix_len + 4;
            let extra_val = u32::from_le_bytes(
                self.raw[extra_offset..extra_offset + 4]
                    .try_into()
                    .unwrap_or([0; 4]),
            );
            write_u32_le(&mut out, extra_val)?;
        }

        write_u32_le(&mut out, self.textures.len() as u32)?;

        for slot in &self.textures {
            write_u32_le(&mut out, 1u32)?;
            write_u32_le(&mut out, slot.name.len() as u32)?;
            out.write_all(slot.name.as_bytes())
                .map_err(crate::errors::AppError::Io)?;
            write_u32_le(&mut out, slot.data.len() as u32)?;
            out.write_all(&slot.data)
                .map_err(crate::errors::AppError::Io)?;
        }

        if self.texture_section_end < self.raw.len() {
            out.write_all(&self.raw[self.texture_section_end..])
                .map_err(crate::errors::AppError::Io)?;
        }

        std::fs::write(path, &out)?;
        Ok(())
    }
}

fn read_u32_le(cursor: &mut Cursor<&Vec<u8>>) -> Result<u32, crate::errors::AppError> {
    let mut buf = [0u8; 4];
    cursor
        .read_exact(&mut buf)
        .map_err(|e| crate::errors::AppError::Kn5Parse(e.to_string()))?;
    Ok(u32::from_le_bytes(buf))
}

fn write_u32_le(out: &mut Vec<u8>, val: u32) -> Result<(), crate::errors::AppError> {
    out.write_all(&val.to_le_bytes())
        .map_err(crate::errors::AppError::Io)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn build_minimal_kn5(version: u32, textures: &[(&str, &[u8])]) -> Vec<u8> {
        let mut buf: Vec<u8> = Vec::new();
        buf.write_all(b"sc6969").unwrap();
        buf.write_all(&version.to_le_bytes()).unwrap();
        buf.write_all(&0u32.to_le_bytes()).unwrap(); // unknown

        buf.write_all(&(textures.len() as u32).to_le_bytes())
            .unwrap();
        for (name, data) in textures {
            buf.write_all(&1u32.to_le_bytes()).unwrap(); // active
            buf.write_all(&(name.len() as u32).to_le_bytes()).unwrap();
            buf.write_all(name.as_bytes()).unwrap();
            buf.write_all(&(data.len() as u32).to_le_bytes()).unwrap();
            buf.write_all(data).unwrap();
        }
        buf
    }

    #[test]
    fn open_minimal_kn5_version5_reads_textures() {
        let tex1 = b"DDS data for tex1";
        let tex2 = b"DDS data for tex2";
        let kn5_bytes = build_minimal_kn5(5, &[("tex1.dds", tex1), ("tex2.dds", tex2)]);

        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), &kn5_bytes).unwrap();

        let kn5 = Kn5File::open(tmp.path()).unwrap();

        assert_eq!(kn5.version, 5);
        let names = kn5.texture_names();
        assert_eq!(names, vec!["tex1.dds", "tex2.dds"]);
        assert_eq!(kn5.get_texture_data("tex1.dds"), Some(tex1.as_ref()));
        assert_eq!(kn5.get_texture_data("tex2.dds"), Some(tex2.as_ref()));
    }

    #[test]
    fn open_kn5_version6_reads_extra_unknown() {
        let tex = b"some dds";
        let mut buf: Vec<u8> = Vec::new();
        buf.write_all(b"sc6969").unwrap();
        buf.write_all(&6u32.to_le_bytes()).unwrap();
        buf.write_all(&0u32.to_le_bytes()).unwrap(); // unknown
        buf.write_all(&0u32.to_le_bytes()).unwrap(); // extra unknown (version > 5)
        buf.write_all(&1u32.to_le_bytes()).unwrap(); // texture count
        buf.write_all(&1u32.to_le_bytes()).unwrap(); // active
        buf.write_all(&(("tex.dds".len()) as u32).to_le_bytes())
            .unwrap();
        buf.write_all(b"tex.dds").unwrap();
        buf.write_all(&(tex.len() as u32).to_le_bytes()).unwrap();
        buf.write_all(tex).unwrap();

        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), &buf).unwrap();

        let kn5 = Kn5File::open(tmp.path()).unwrap();
        assert_eq!(kn5.version, 6);
        assert_eq!(kn5.texture_names(), vec!["tex.dds"]);
    }

    #[test]
    fn get_texture_data_returns_none_for_missing_name() {
        let kn5_bytes = build_minimal_kn5(5, &[("tex1.dds", b"data")]);
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), &kn5_bytes).unwrap();

        let kn5 = Kn5File::open(tmp.path()).unwrap();
        assert!(kn5.get_texture_data("nonexistent.dds").is_none());
    }

    #[test]
    fn replace_texture_data_and_save_round_trips() {
        let original = b"original data";
        let kn5_bytes = build_minimal_kn5(5, &[("tex1.dds", original), ("tex2.dds", b"other")]);

        let tmp_in = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp_in.path(), &kn5_bytes).unwrap();

        let mut kn5 = Kn5File::open(tmp_in.path()).unwrap();
        let new_data = b"new texture data longer than before".to_vec();
        kn5.replace_texture_data("tex1.dds", new_data.clone())
            .unwrap();

        let tmp_out = tempfile::NamedTempFile::new().unwrap();
        kn5.save(tmp_out.path()).unwrap();

        let reloaded = Kn5File::open(tmp_out.path()).unwrap();
        assert_eq!(reloaded.get_texture_data("tex1.dds"), Some(new_data.as_slice()));
        assert_eq!(reloaded.get_texture_data("tex2.dds"), Some(b"other".as_ref()));
    }

    #[test]
    fn replace_texture_data_returns_error_for_missing_name() {
        let kn5_bytes = build_minimal_kn5(5, &[("tex1.dds", b"data")]);
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), &kn5_bytes).unwrap();

        let mut kn5 = Kn5File::open(tmp.path()).unwrap();
        let result = kn5.replace_texture_data("nonexistent.dds", vec![]);
        assert!(result.is_err());
    }

    #[test]
    fn open_fails_with_invalid_magic() {
        let buf = b"INVALID_MAGIC_BYTES_HERE";
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), buf).unwrap();

        let result = Kn5File::open(tmp.path());
        assert!(result.is_err());
    }
}
