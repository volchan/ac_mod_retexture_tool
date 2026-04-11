use base64::engine::general_purpose;
use base64::Engine;
use image::{DynamicImage, ImageBuffer, Rgb, Rgba};
use image_dds::{dds_from_image, image_from_dds, ImageFormat, Mipmaps, Quality};
use std::io::Cursor;

const DDS_MAGIC: &[u8; 4] = b"DDS ";
const DDS_FOURCC_OFFSET: usize = 84;
const DDS_HEADER_MIN_LEN: usize = 128;
const DDS_HEIGHT_OFFSET: usize = 12;
const DDS_WIDTH_OFFSET: usize = 16;
const DDS_PF_FLAGS_OFFSET: usize = 80;
const DDS_PF_BITCOUNT_OFFSET: usize = 88;
const DDS_DDPF_RGB: u32 = 0x40;
const DDS_DDPF_ALPHAPIXELS: u32 = 0x01;
const PNG_MAGIC: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
const PNG_WIDTH_OFFSET: usize = 16;
const PNG_HEIGHT_OFFSET: usize = 20;

/// Try to decode uncompressed RGB/RGBA DDS data that `image-dds` doesn't support.
fn decode_uncompressed(data: &[u8]) -> Option<DynamicImage> {
    if data.len() < DDS_HEADER_MIN_LEN {
        return None;
    }
    let height = u32::from_le_bytes(data[12..16].try_into().ok()?) as usize;
    let width = u32::from_le_bytes(data[16..20].try_into().ok()?) as usize;
    let pf_flags = u32::from_le_bytes(data[DDS_PF_FLAGS_OFFSET..DDS_PF_FLAGS_OFFSET + 4].try_into().ok()?);
    let bit_count = u32::from_le_bytes(data[DDS_PF_BITCOUNT_OFFSET..DDS_PF_BITCOUNT_OFFSET + 4].try_into().ok()?);

    if pf_flags & DDS_DDPF_RGB == 0 {
        return None;
    }

    let pixel_data = &data[DDS_HEADER_MIN_LEN..];
    let has_alpha = pf_flags & DDS_DDPF_ALPHAPIXELS != 0;

    match (bit_count, has_alpha) {
        (24, false) => {
            let bytes_needed = width * height * 3;
            if pixel_data.len() < bytes_needed {
                return None;
            }
            let img = ImageBuffer::<Rgb<u8>, _>::from_raw(
                width as u32,
                height as u32,
                pixel_data[..bytes_needed].to_vec(),
            )?;
            Some(DynamicImage::ImageRgb8(img))
        }
        (32, true) => {
            let bytes_needed = width * height * 4;
            if pixel_data.len() < bytes_needed {
                return None;
            }
            let img = ImageBuffer::<Rgba<u8>, _>::from_raw(
                width as u32,
                height as u32,
                pixel_data[..bytes_needed].to_vec(),
            )?;
            Some(DynamicImage::ImageRgba8(img))
        }
        _ => None,
    }
}

pub fn decode_to_image(data: &[u8]) -> Result<DynamicImage, crate::errors::AppError> {
    if !data.starts_with(b"DDS ") {
        return image::load_from_memory(data)
            .map_err(|e| crate::errors::AppError::ImageDecode(e.to_string()));
    }
    let dds = image_dds::ddsfile::Dds::read(Cursor::new(data))
        .map_err(|e| crate::errors::AppError::ImageDecode(e.to_string()))?;
    match image_from_dds(&dds, 0) {
        Ok(rgba_image) => Ok(DynamicImage::ImageRgba8(rgba_image)),
        Err(_) => decode_uncompressed(data).ok_or_else(|| {
            crate::errors::AppError::ImageDecode("unsupported DDS format".to_string())
        }),
    }
}

pub fn encode_from_image(
    img: &DynamicImage,
    format: &str,
) -> Result<Vec<u8>, crate::errors::AppError> {
    let image_format = parse_image_format(format)?;
    let rgba = img.to_rgba8();
    let dds = dds_from_image(&rgba, image_format, Quality::Normal, Mipmaps::GeneratedAutomatic)
        .map_err(|e| crate::errors::AppError::ImageEncode(e.to_string()))?;
    let mut out = Vec::new();
    dds.write(&mut out)
        .map_err(|e| crate::errors::AppError::ImageEncode(e.to_string()))?;
    Ok(out)
}

pub fn generate_thumbnail(data: &[u8], max_size: u32) -> Result<String, crate::errors::AppError> {
    let img = decode_to_image(data)?;
    let resized = img.thumbnail(max_size, max_size);
    let mut png_bytes: Vec<u8> = Vec::new();
    resized
        .write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .map_err(|e| crate::errors::AppError::ImageEncode(e.to_string()))?;
    let b64 = general_purpose::STANDARD.encode(&png_bytes);
    Ok(format!("data:image/png;base64,{b64}"))
}

pub fn detect_format(data: &[u8]) -> String {
    if data.len() < 4 {
        return "unknown".to_string();
    }
    if &data[0..4] != DDS_MAGIC {
        if data.len() >= 8 && &data[0..8] == PNG_MAGIC {
            return "PNG".to_string();
        }
        return "unknown".to_string();
    }
    if data.len() < DDS_HEADER_MIN_LEN {
        return "unknown".to_string();
    }
    let fourcc = &data[DDS_FOURCC_OFFSET..DDS_FOURCC_OFFSET + 4];
    match fourcc {
        b"DXT1" => "BC1".to_string(),
        b"DXT3" => "BC2".to_string(),
        b"DXT5" => "BC3".to_string(),
        b"BC4U" | b"ATI1" => "BC4".to_string(),
        b"BC5U" | b"ATI2" => "BC5".to_string(),
        b"DX10" => detect_dxgi_format(data),
        _ => {
            let flags = u32::from_le_bytes([data[80], data[81], data[82], data[83]]);
            if flags & 0x40 != 0 {
                "RGBA8".to_string()
            } else {
                "unknown".to_string()
            }
        }
    }
}

fn detect_dxgi_format(data: &[u8]) -> String {
    if data.len() < DDS_HEADER_MIN_LEN + 4 {
        return "DX10".to_string();
    }
    let dxgi = u32::from_le_bytes([
        data[DDS_HEADER_MIN_LEN],
        data[DDS_HEADER_MIN_LEN + 1],
        data[DDS_HEADER_MIN_LEN + 2],
        data[DDS_HEADER_MIN_LEN + 3],
    ]);
    match dxgi {
        70 | 71 => "BC1".to_string(),
        72 | 73 => "BC2".to_string(),
        74 | 75 => "BC3".to_string(),
        80 | 81 => "BC4".to_string(),
        82 | 83 => "BC5".to_string(),
        94 | 95 => "BC6H".to_string(),
        97 | 98 => "BC7".to_string(),
        28 => "RGBA8".to_string(),
        _ => format!("DXGI{dxgi}"),
    }
}

fn parse_image_format(format: &str) -> Result<ImageFormat, crate::errors::AppError> {
    match format {
        "BC1_UNORM" | "BC1" => Ok(ImageFormat::BC1RgbaUnorm),
        "BC2_UNORM" | "BC2" => Ok(ImageFormat::BC2RgbaUnorm),
        "BC3_UNORM" | "BC3" => Ok(ImageFormat::BC3RgbaUnorm),
        "BC4_UNORM" | "BC4" => Ok(ImageFormat::BC4RUnorm),
        "BC5_UNORM" | "BC5" => Ok(ImageFormat::BC5RgUnorm),
        "BC6H_UF16" | "BC6H" => Ok(ImageFormat::BC6hRgbUfloat),
        "BC7_UNORM" | "BC7" => Ok(ImageFormat::BC7RgbaUnorm),
        "RGBA8" => Ok(ImageFormat::Rgba8Unorm),
        other => Err(crate::errors::AppError::ImageEncode(format!(
            "unsupported format: {other}"
        ))),
    }
}

pub fn parse_dds_dimensions(data: &[u8]) -> (u32, u32) {
    if data.len() < 4 {
        return (0, 0);
    }
    if &data[0..4] != DDS_MAGIC {
        // PNG: width at bytes 16-19, height at 20-23 (big-endian)
        if data.len() >= PNG_HEIGHT_OFFSET + 4 && &data[0..8] == PNG_MAGIC {
            let width = u32::from_be_bytes([
                data[PNG_WIDTH_OFFSET],
                data[PNG_WIDTH_OFFSET + 1],
                data[PNG_WIDTH_OFFSET + 2],
                data[PNG_WIDTH_OFFSET + 3],
            ]);
            let height = u32::from_be_bytes([
                data[PNG_HEIGHT_OFFSET],
                data[PNG_HEIGHT_OFFSET + 1],
                data[PNG_HEIGHT_OFFSET + 2],
                data[PNG_HEIGHT_OFFSET + 3],
            ]);
            return (width, height);
        }
        return (0, 0);
    }
    if data.len() < DDS_WIDTH_OFFSET + 4 {
        return (0, 0);
    }
    let height = u32::from_le_bytes([
        data[DDS_HEIGHT_OFFSET],
        data[DDS_HEIGHT_OFFSET + 1],
        data[DDS_HEIGHT_OFFSET + 2],
        data[DDS_HEIGHT_OFFSET + 3],
    ]);
    let width = u32::from_le_bytes([
        data[DDS_WIDTH_OFFSET],
        data[DDS_WIDTH_OFFSET + 1],
        data[DDS_WIDTH_OFFSET + 2],
        data[DDS_WIDTH_OFFSET + 3],
    ]);
    (width, height)
}

/// FNV-1a hash of the image's raw RGBA pixel bytes.
/// Used to detect whether a texture has been modified since extraction.
pub fn pixel_hash(img: &DynamicImage) -> u64 {
    img.to_rgba8()
        .as_raw()
        .iter()
        .fold(14695981039346656037u64, |h, &b| {
            h.wrapping_mul(1099511628211) ^ b as u64
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageBuffer, Rgba};
    use image_dds::dds_from_image;

    fn solid_red_dds() -> Vec<u8> {
        let width = 64u32;
        let height = 64u32;
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_fn(width, height, |_, _| Rgba([255, 0, 0, 255]));
        let rgba = DynamicImage::ImageRgba8(img).to_rgba8();
        let dds =
            dds_from_image(&rgba, ImageFormat::BC1RgbaUnorm, Quality::Fast, Mipmaps::Disabled)
                .unwrap();
        let mut out = Vec::new();
        dds.write(&mut out).unwrap();
        out
    }

    fn build_dxt1_header() -> Vec<u8> {
        let mut data = vec![0u8; 128];
        data[0..4].copy_from_slice(b"DDS ");
        data[4..8].copy_from_slice(&124u32.to_le_bytes()); // header size
        data[12..16].copy_from_slice(&64u32.to_le_bytes()); // height
        data[16..20].copy_from_slice(&64u32.to_le_bytes()); // width
        data[76..80].copy_from_slice(&32u32.to_le_bytes()); // pixel format size
        data[84..88].copy_from_slice(b"DXT1"); // FourCC
        data
    }

    fn build_dxt5_header() -> Vec<u8> {
        let mut data = vec![0u8; 128];
        data[0..4].copy_from_slice(b"DDS ");
        data[4..8].copy_from_slice(&124u32.to_le_bytes());
        data[12..16].copy_from_slice(&64u32.to_le_bytes());
        data[16..20].copy_from_slice(&64u32.to_le_bytes());
        data[76..80].copy_from_slice(&32u32.to_le_bytes());
        data[84..88].copy_from_slice(b"DXT5");
        data
    }

    #[test]
    fn test_generate_thumbnail_with_solid_color() {
        let dds_data = solid_red_dds();
        let result = generate_thumbnail(&dds_data, 128).unwrap();
        assert!(result.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn test_detect_format_dxt1() {
        let data = build_dxt1_header();
        assert_eq!(detect_format(&data), "BC1");
    }

    #[test]
    fn test_detect_format_dxt5() {
        let data = build_dxt5_header();
        assert_eq!(detect_format(&data), "BC3");
    }

    #[test]
    fn test_detect_format_unknown_magic() {
        let data = vec![0u8; 128];
        assert_eq!(detect_format(&data), "unknown");
    }

    #[test]
    fn test_detect_format_too_short() {
        let data = vec![0u8; 10];
        assert_eq!(detect_format(&data), "unknown");
    }

    #[test]
    fn test_parse_dds_dimensions() {
        let mut data = vec![0u8; 20];
        data[0..4].copy_from_slice(b"DDS ");
        data[12..16].copy_from_slice(&1024u32.to_le_bytes()); // height
        data[16..20].copy_from_slice(&2048u32.to_le_bytes()); // width
        let (w, h) = parse_dds_dimensions(&data);
        assert_eq!(w, 2048);
        assert_eq!(h, 1024);
    }

    #[test]
    fn test_parse_dds_dimensions_invalid_magic() {
        let data = vec![0u8; 20];
        let (w, h) = parse_dds_dimensions(&data);
        assert_eq!(w, 0);
        assert_eq!(h, 0);
    }

    #[test]
    fn test_parse_dds_dimensions_too_short() {
        let data = vec![0u8; 5];
        let (w, h) = parse_dds_dimensions(&data);
        assert_eq!(w, 0);
        assert_eq!(h, 0);
    }

    #[test]
    fn test_encode_from_image_bc1() {
        let img =
            DynamicImage::ImageRgba8(ImageBuffer::from_fn(4, 4, |_, _| Rgba([0, 255, 0, 255])));
        let result = encode_from_image(&img, "BC1");
        assert!(result.is_ok());
        let data = result.unwrap();
        assert!(&data[0..4] == b"DDS ");
    }

    #[test]
    fn test_encode_from_image_unsupported_format() {
        let img =
            DynamicImage::ImageRgba8(ImageBuffer::from_fn(4, 4, |_, _| Rgba([0, 0, 255, 255])));
        let result = encode_from_image(&img, "INVALID_FORMAT");
        assert!(result.is_err());
    }

    #[test]
    fn test_decode_to_image_valid() {
        let dds_data = solid_red_dds();
        let result = decode_to_image(&dds_data);
        assert!(result.is_ok());
        let img = result.unwrap();
        assert_eq!(img.width(), 64);
        assert_eq!(img.height(), 64);
    }

    #[test]
    fn test_decode_to_image_invalid_data() {
        let data = vec![0u8; 32];
        let result = decode_to_image(&data);
        assert!(result.is_err());
    }

    #[test]
    fn test_decode_to_image_png_fallback() {
        let img = DynamicImage::ImageRgba8(ImageBuffer::from_fn(8, 8, |_, _| Rgba([0u8, 0, 255, 255])));
        let mut png_bytes: Vec<u8> = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png).unwrap();
        let result = decode_to_image(&png_bytes);
        assert!(result.is_ok());
        let decoded = result.unwrap();
        assert_eq!(decoded.width(), 8);
        assert_eq!(decoded.height(), 8);
    }

    fn make_png_bytes(width: u32, height: u32) -> Vec<u8> {
        let img = DynamicImage::ImageRgba8(ImageBuffer::from_fn(width, height, |_, _| {
            Rgba([0u8, 128, 255, 255])
        }));
        let mut png_bytes: Vec<u8> = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png)
            .unwrap();
        png_bytes
    }

    #[test]
    fn test_detect_format_png() {
        let data = make_png_bytes(32, 32);
        assert_eq!(detect_format(&data), "PNG");
    }

    #[test]
    fn test_parse_dds_dimensions_png() {
        let data = make_png_bytes(256, 128);
        let (w, h) = parse_dds_dimensions(&data);
        assert_eq!(w, 256);
        assert_eq!(h, 128);
    }

    #[test]
    fn test_to_png_name_already_png() {
        // to_png_name is in extract.rs, but we verify via extract tests
        // This is a companion test for the detect/dimensions logic
        let data = make_png_bytes(64, 64);
        let (w, h) = parse_dds_dimensions(&data);
        assert_eq!(w, 64);
        assert_eq!(h, 64);
    }

    #[test]
    fn test_detect_format_dxgi_bc7() {
        let mut data = vec![0u8; 132];
        data[0..4].copy_from_slice(b"DDS ");
        data[84..88].copy_from_slice(b"DX10");
        data[80..84].copy_from_slice(&0u32.to_le_bytes());
        data[128..132].copy_from_slice(&98u32.to_le_bytes()); // DXGI format 98 = BC7_UNORM_SRGB
        assert_eq!(detect_format(&data), "BC7");
    }
}
