use base64::engine::general_purpose;
use base64::Engine;
use image::DynamicImage;
use image_dds::{dds_from_image, image_from_dds, ImageFormat, Mipmaps, Quality};
use std::io::Cursor;

const DDS_MAGIC: &[u8; 4] = b"DDS ";
const DDS_FOURCC_OFFSET: usize = 84;
const DDS_HEADER_MIN_LEN: usize = 128;
const DDS_HEIGHT_OFFSET: usize = 12;
const DDS_WIDTH_OFFSET: usize = 16;

pub fn decode_to_image(data: &[u8]) -> Result<DynamicImage, crate::errors::AppError> {
    let dds = image_dds::ddsfile::Dds::read(Cursor::new(data))
        .map_err(|e| crate::errors::AppError::ImageDecode(e.to_string()))?;
    let rgba_image = image_from_dds(&dds, 0)
        .map_err(|e| crate::errors::AppError::ImageDecode(e.to_string()))?;
    Ok(DynamicImage::ImageRgba8(rgba_image))
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
    if data.len() < DDS_HEADER_MIN_LEN {
        return "unknown".to_string();
    }
    if &data[0..4] != DDS_MAGIC {
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
    if data.len() < DDS_WIDTH_OFFSET + 4 {
        return (0, 0);
    }
    if &data[0..4] != DDS_MAGIC {
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
    fn test_detect_format_dxgi_bc7() {
        let mut data = vec![0u8; 132];
        data[0..4].copy_from_slice(b"DDS ");
        data[84..88].copy_from_slice(b"DX10");
        data[80..84].copy_from_slice(&0u32.to_le_bytes());
        data[128..132].copy_from_slice(&98u32.to_le_bytes()); // DXGI format 98 = BC7_UNORM_SRGB
        assert_eq!(detect_format(&data), "BC7");
    }
}
