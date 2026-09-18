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
    for triangle in mesh.indices.as_chunks::<3>().0 {
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
/// vertical coordinate is negated rather than offset. This is the same flip
/// `car_model::pack` applies as `1.0 + uv[1]`, read against a row index instead
/// of a texture coordinate.
fn to_pixel(uv: [f32; 2], width: u32, height: u32) -> (f32, f32) {
    (uv[0] * width as f32, -uv[1] * height as f32)
}

/// The part of the segment that lands on the image, or nothing when none of it
/// does. Liang-Barsky, parametric so a coordinate far outside costs one division
/// rather than a walk.
///
/// A KN5 is free to carry tiling UVs, and a corrupt one carries anything at all:
/// the Bresenham walk below advances a pixel per step, so a segment running out
/// to a million would hold the blocking task for billions of them, and one with
/// a non-finite endpoint would never reach its target.
fn clip(
    from: (f32, f32),
    to: (f32, f32),
    width: u32,
    height: u32,
    margin: i32,
) -> Option<((f32, f32), (f32, f32))> {
    if ![from.0, from.1, to.0, to.1].iter().all(|v| v.is_finite()) {
        return None;
    }

    let low = -(margin as f32);
    let (high_x, high_y) = (
        (width as f32 - 1.0) + margin as f32,
        (height as f32 - 1.0) + margin as f32,
    );
    let (dx, dy) = (to.0 - from.0, to.1 - from.1);
    let (mut enter, mut leave) = (0.0f32, 1.0f32);

    for (edge, distance) in [
        (-dx, from.0 - low),
        (dx, high_x - from.0),
        (-dy, from.1 - low),
        (dy, high_y - from.1),
    ] {
        if edge == 0.0 {
            // Parallel to this edge: either wholly inside it or wholly outside.
            if distance < 0.0 {
                return None;
            }
            continue;
        }
        let crossing = distance / edge;
        if edge < 0.0 {
            if crossing > leave {
                return None;
            }
            enter = enter.max(crossing);
        } else {
            if crossing < enter {
                return None;
            }
            leave = leave.min(crossing);
        }
    }

    Some((
        (from.0 + enter * dx, from.1 + enter * dy),
        (from.0 + leave * dx, from.1 + leave * dy),
    ))
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
    let Some((start, end)) = clip(
        to_pixel(from, width, height),
        to_pixel(to, width, height),
        width,
        height,
        spread,
    ) else {
        return;
    };

    let (mut x, mut y) = (start.0.round() as i32, start.1.round() as i32);
    let (target_x, target_y) = (end.0.round() as i32, end.1.round() as i32);

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

#[cfg(test)]
mod tests {
    use super::*;

    fn mesh(uvs: &[[f32; 2]], indices: &[u16]) -> UvMesh {
        UvMesh {
            name: "body".to_string(),
            material_id: 0,
            uvs: uvs.to_vec(),
            positions: vec![],
            indices: indices.to_vec(),
        }
    }

    /// An edge two triangles share sits inside a flat area; one triangle owns the
    /// edge where the island ends, and that is the only line worth drawing.
    #[test]
    fn only_the_edges_a_single_triangle_owns_are_borders() {
        // Two triangles making a quad: the diagonal is shared, the four sides are not.
        let quad = mesh(
            &[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
            &[0, 1, 2, 0, 2, 3],
        );

        let mut borders = border_edges(&quad);
        borders.sort_unstable();

        assert_eq!(borders, vec![(0, 1), (0, 3), (1, 2), (2, 3)]);
    }

    #[test]
    fn an_edge_is_the_same_edge_whichever_way_round_it_is_wound() {
        let butterfly = mesh(&[[0.0; 2]; 4], &[0, 1, 2, 2, 1, 3]);

        let mut borders = border_edges(&butterfly);
        borders.sort_unstable();

        // (1, 2) is wound both ways and drops out; the other four remain.
        assert_eq!(borders, vec![(0, 1), (0, 2), (1, 3), (2, 3)]);
    }

    #[test]
    fn a_lone_triangle_is_all_border() {
        assert_eq!(border_edges(&mesh(&[[0.0; 2]; 3], &[0, 1, 2])).len(), 3);
    }

    /// The same flip `car_model::pack` writes as `1.0 + uv[1]`: V climbs while
    /// image rows descend, so the bottom of the sheet is V = -1, not V = 0.
    #[test]
    fn v_is_negated_rather_than_offset() {
        assert_eq!(to_pixel([0.0, 0.0], 256, 128), (0.0, 0.0));
        assert_eq!(to_pixel([1.0, -1.0], 256, 128), (256.0, 128.0));
        assert_eq!(to_pixel([0.5, -0.5], 256, 128), (128.0, 64.0));
    }

    #[test]
    fn a_segment_inside_the_image_is_left_alone() {
        let clipped = clip((10.0, 10.0), (20.0, 20.0), 64, 64, 0);
        assert_eq!(clipped, Some(((10.0, 10.0), (20.0, 20.0))));
    }

    /// A tiling UV runs far past the sheet, and Bresenham walks a pixel per step.
    #[test]
    fn a_segment_running_far_outside_keeps_only_the_part_on_the_sheet() {
        let (start, end) = clip((0.0, 0.0), (1e6, 0.0), 64, 64, 0).expect("it crosses the image");

        assert_eq!(start, (0.0, 0.0));
        assert_eq!(end.0, 63.0);
    }

    #[test]
    fn a_segment_that_never_touches_the_image_is_dropped() {
        assert_eq!(clip((-500.0, -500.0), (-400.0, -400.0), 64, 64, 0), None);
    }

    #[test]
    fn a_non_finite_coordinate_is_dropped_rather_than_walked_towards() {
        assert_eq!(clip((0.0, 0.0), (f32::INFINITY, 0.0), 64, 64, 0), None);
        assert_eq!(clip((f32::NAN, 0.0), (10.0, 10.0), 64, 64, 0), None);
    }

    /// The halo is drawn by widening the stroke, so a seam just off the sheet
    /// still has to reach the pixels its halo covers.
    #[test]
    fn the_margin_keeps_a_seam_whose_halo_still_lands() {
        assert!(clip((65.0, 10.0), (70.0, 10.0), 64, 64, 0).is_none());
        assert!(clip((65.0, 10.0), (70.0, 10.0), 64, 64, 2).is_some());
    }

    #[test]
    fn rendering_a_tiling_mesh_terminates_and_draws_something() {
        let tiled = mesh(&[[0.0, 0.0], [1e6, 0.0], [0.5, -1.0]], &[0, 1, 2]);
        let img = render(&[&tiled], 32, 32);

        assert!(img.pixels().any(|pixel| pixel.0[3] > 0));
    }
}
