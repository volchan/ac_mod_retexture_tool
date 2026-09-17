//! Turns the UV coordinates of a car's meshes into a wireframe a painter can
//! trace over: the outline of every UV island, drawn at the texture's own size.

use std::collections::HashMap;

use image::{Rgba, RgbaImage};

use crate::parsers::kn5_mesh::UvMesh;

const LINE_COLOR: Rgba<u8> = Rgba([255, 255, 255, 255]);
/// A white hairline vanishes on a white panel and a dark one vanishes on carbon,
/// so every seam is drawn as a bright core inside a dark halo and reads on both.
const HALO_COLOR: Rgba<u8> = Rgba([0, 0, 0, 235]);

/// Draws the island borders of `meshes` onto a transparent image, so the result
/// can sit straight on top of the texture being edited.
pub fn render(meshes: &[&UvMesh], width: u32, height: u32) -> RgbaImage {
    let mut img = RgbaImage::new(width, height);
    let edges: Vec<([f32; 2], [f32; 2])> = meshes
        .iter()
        .flat_map(|mesh| {
            border_edges(mesh)
                .into_iter()
                .filter_map(|(a, b)| Some((*mesh.uvs.get(a as usize)?, *mesh.uvs.get(b as usize)?)))
        })
        .collect();

    // The halo goes down first across every edge: drawing it per edge would let a
    // neighbouring seam's halo erase the bright core already written.
    for (from, to) in &edges {
        line(&mut img, *from, *to, width, height, HALO_COLOR, 1);
    }
    for (from, to) in &edges {
        line(&mut img, *from, *to, width, height, LINE_COLOR, 0);
    }
    img
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// An edge shared by two triangles sits inside a flat area and only adds noise;
/// one that belongs to a single triangle is where the island ends, which is the
/// seam a painter has to stay inside of.
fn border_edges(mesh: &UvMesh) -> Vec<(u16, u16)> {
    let mut uses: HashMap<(u16, u16), u32> = HashMap::new();
    for triangle in mesh.indices.chunks_exact(3) {
        let corners = [
            (triangle[0], triangle[1]),
            (triangle[1], triangle[2]),
            (triangle[2], triangle[0]),
        ];
        for (a, b) in corners {
            let key = if a < b { (a, b) } else { (b, a) };
            *uses.entry(key).or_insert(0) += 1;
        }
    }
    uses.into_iter()
        .filter(|(_, count)| *count == 1)
        .map(|(edge, _)| edge)
        .collect()
}

/// KN5 stores V pointing up while an image addresses rows downwards, so the
/// vertical coordinate is negated rather than offset.
fn to_pixel(uv: [f32; 2], width: u32, height: u32) -> (i32, i32) {
    (
        (uv[0] * width as f32) as i32,
        (-uv[1] * height as f32) as i32,
    )
}

/// `spread` widens the stroke by that many pixels on every side, which is how the
/// halo ends up surrounding the core rather than sitting beside it.
fn line(
    img: &mut RgbaImage,
    from: [f32; 2],
    to: [f32; 2],
    width: u32,
    height: u32,
    color: Rgba<u8>,
    spread: i32,
) {
    let (mut x, mut y) = to_pixel(from, width, height);
    let (target_x, target_y) = to_pixel(to, width, height);

    let dx = (target_x - x).abs();
    let dy = -(target_y - y).abs();
    let step_x = if x < target_x { 1 } else { -1 };
    let step_y = if y < target_y { 1 } else { -1 };
    let mut error = dx + dy;

    loop {
        for offset_y in -spread..=spread {
            for offset_x in -spread..=spread {
                let (px, py) = (x + offset_x, y + offset_y);
                if px >= 0 && py >= 0 && (px as u32) < width && (py as u32) < height {
                    img.put_pixel(px as u32, py as u32, color);
                }
            }
        }
        if x == target_x && y == target_y {
            return;
        }
        let doubled = 2 * error;
        if doubled >= dy {
            error += dy;
            x += step_x;
        }
        if doubled <= dx {
            error += dx;
            y += step_y;
        }
    }
}
