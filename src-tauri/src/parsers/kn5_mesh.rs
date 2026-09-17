//! Reads the part of a KN5 that [`super::kn5::Kn5File`] deliberately ignores:
//! the materials and the node tree, down to the UV coordinates of every mesh.
//!
//! Only what a UV overlay needs is kept — positions, normals and tangents are
//! skipped as they are read, so a 60 MB car costs a single pass and a few
//! hundred KB of retained data.

use std::path::Path;

use crate::errors::AppError;

pub struct Kn5Geometry {
    pub materials: Vec<Material>,
    pub meshes: Vec<UvMesh>,
}

pub struct Material {
    pub name: String,
    /// `(sampler, texture file name)`, e.g. `("txDiffuse", "body.dds")`.
    pub textures: Vec<(String, String)>,
}

pub struct UvMesh {
    pub name: String,
    pub material_id: u32,
    pub uvs: Vec<[f32; 2]>,
    /// Vertex positions in car space, with the node's parent transforms already
    /// applied: a KN5 places a wheel or a wing by its node, not by its vertices.
    pub positions: Vec<[f32; 3]>,
    pub indices: Vec<u16>,
}

/// Row-major 4x4, translation in the last row, as KN5 stores it.
type Matrix = [f32; 16];

const IDENTITY: Matrix = [
    1.0, 0.0, 0.0, 0.0, //
    0.0, 1.0, 0.0, 0.0, //
    0.0, 0.0, 1.0, 0.0, //
    0.0, 0.0, 0.0, 1.0,
];

/// Walks a KN5 and returns every mesh that carries UVs, along with the material
/// table needed to tell which of them use a given texture.
pub fn read_geometry(path: &Path) -> Result<Kn5Geometry, AppError> {
    let raw = std::fs::read(path)?;
    let mut r = Reader { data: &raw, pos: 0 };

    r.expect_magic()?;
    let version = r.u32()?;
    if version > 5 {
        r.skip(4)?;
    }
    skip_textures(&mut r)?;

    let materials = read_materials(&mut r, version)?;
    let mut meshes = Vec::new();
    read_node(&mut r, &mut meshes, IDENTITY)?;

    Ok(Kn5Geometry { materials, meshes })
}

impl Kn5Geometry {
    /// Meshes whose material references `texture_name` in any sampler slot.
    pub fn meshes_using(&self, texture_name: &str) -> Vec<&UvMesh> {
        self.meshes
            .iter()
            .filter(|m| {
                self.materials
                    .get(m.material_id as usize)
                    .is_some_and(|mat| {
                        mat.textures
                            .iter()
                            .any(|(_, tex)| tex.eq_ignore_ascii_case(texture_name))
                    })
            })
            .collect()
    }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

fn skip_textures(r: &mut Reader) -> Result<(), AppError> {
    let count = r.u32()?;
    for _ in 0..count {
        // An inactive slot is the flag and nothing else: no name, no payload.
        if r.u32()? == 0 {
            continue;
        }
        let name_len = r.u32()? as usize;
        r.skip(name_len)?;
        let data_len = r.u32()? as usize;
        r.skip(data_len)?;
    }
    Ok(())
}

fn read_materials(r: &mut Reader, version: u32) -> Result<Vec<Material>, AppError> {
    let count = r.u32()?;
    let mut materials = Vec::with_capacity(count as usize);

    for _ in 0..count {
        let name = r.string()?;
        let _shader = r.string()?;
        r.skip(2)?; // alpha blend mode, alpha tested
        if version > 4 {
            r.skip(4)?; // depth mode
        }

        let prop_count = r.u32()?;
        for _ in 0..prop_count {
            let _prop_name = r.string()?;
            r.skip(4 * 10)?; // one float, then a vec2, a vec3 and a vec4
        }

        let texture_count = r.u32()?;
        let mut textures = Vec::with_capacity(texture_count as usize);
        for _ in 0..texture_count {
            let sampler = r.string()?;
            r.skip(4)?; // slot
            textures.push((sampler, r.string()?));
        }

        materials.push(Material { name, textures });
    }

    Ok(materials)
}

fn read_node(r: &mut Reader, out: &mut Vec<UvMesh>, parent: Matrix) -> Result<(), AppError> {
    const DUMMY: u32 = 1;
    const MESH: u32 = 2;
    const SKINNED_MESH: u32 = 3;

    let class_id = r.u32()?;
    let name = r.string()?;
    let children = r.u32()?;
    r.skip(1)?; // active

    let mut transform = parent;
    match class_id {
        DUMMY => transform = multiply(&r.matrix()?, &parent),
        MESH => out.push(read_mesh(r, name, false, &parent)?),
        SKINNED_MESH => out.push(read_mesh(r, name, true, &parent)?),
        other => {
            return Err(AppError::Kn5Parse(format!(
                "unknown node class {other} at byte {}",
                r.pos
            )))
        }
    }

    for _ in 0..children {
        read_node(r, out, transform)?;
    }
    Ok(())
}

/// Skinned meshes carry bone weights, which widens the vertex and shortens the
/// trailer; the UV pair sits at the same offset in both, so everything around
/// it is skipped rather than decoded.
fn read_mesh(
    r: &mut Reader,
    name: String,
    skinned: bool,
    transform: &Matrix,
) -> Result<UvMesh, AppError> {
    // A vertex opens with its position, normal and UV, in that order.
    const CONSUMED_PER_VERTEX: usize = 4 * 8;
    let vertex_size = if skinned { 76 } else { 44 };

    r.skip(3)?; // cast shadows, visible, transparent

    if skinned {
        let bone_count = r.u32()?;
        for _ in 0..bone_count {
            let _bone_name = r.string()?;
            r.skip(4 * 16)?; // inverse bind matrix
        }
    }

    let vertex_count = r.u32()? as usize;
    let mut uvs = Vec::with_capacity(vertex_count);
    let mut positions = Vec::with_capacity(vertex_count);
    for _ in 0..vertex_count {
        let local = [r.f32()?, r.f32()?, r.f32()?];
        positions.push(apply(transform, local));
        r.skip(4 * 3)?; // normal
        uvs.push([r.f32()?, r.f32()?]);
        r.skip(vertex_size - CONSUMED_PER_VERTEX)?; // tangent, and any skin weights
    }

    let index_count = r.u32()? as usize;
    let mut indices = Vec::with_capacity(index_count);
    for _ in 0..index_count {
        indices.push(r.u16()?);
    }

    let material_id = r.u32()?;
    r.skip(4)?; // layer
    r.skip(8)?; // lod in and out
    if !skinned {
        r.skip(4 * 4)?; // bounding sphere: centre then radius
        r.skip(1)?; // is renderable
    }

    Ok(UvMesh {
        name,
        material_id,
        uvs,
        positions,
        indices,
    })
}

fn multiply(child: &Matrix, parent: &Matrix) -> Matrix {
    let mut out = [0.0f32; 16];
    for row in 0..4 {
        for column in 0..4 {
            out[row * 4 + column] = (0..4)
                .map(|k| child[row * 4 + k] * parent[k * 4 + column])
                .sum();
        }
    }
    out
}

fn apply(m: &Matrix, v: [f32; 3]) -> [f32; 3] {
    [
        v[0] * m[0] + v[1] * m[4] + v[2] * m[8] + m[12],
        v[0] * m[1] + v[1] * m[5] + v[2] * m[9] + m[13],
        v[0] * m[2] + v[1] * m[6] + v[2] * m[10] + m[14],
    ]
}

struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn expect_magic(&mut self) -> Result<(), AppError> {
        if self.data.len() < 6 || &self.data[..6] != b"sc6969" {
            return Err(AppError::Kn5Parse("invalid KN5 magic".to_string()));
        }
        self.pos = 6;
        Ok(())
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8], AppError> {
        let end = self.pos.checked_add(n).ok_or_else(|| self.overflow(n))?;
        if end > self.data.len() {
            return Err(self.overflow(n));
        }
        let slice = &self.data[self.pos..end];
        self.pos = end;
        Ok(slice)
    }

    fn skip(&mut self, n: usize) -> Result<(), AppError> {
        self.take(n).map(|_| ())
    }

    fn u16(&mut self) -> Result<u16, AppError> {
        let b = self.take(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    fn u32(&mut self) -> Result<u32, AppError> {
        let b = self.take(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn f32(&mut self) -> Result<f32, AppError> {
        let b = self.take(4)?;
        Ok(f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn matrix(&mut self) -> Result<Matrix, AppError> {
        let mut out = IDENTITY;
        for slot in out.iter_mut() {
            *slot = self.f32()?;
        }
        Ok(out)
    }

    fn string(&mut self) -> Result<String, AppError> {
        let len = self.u32()? as usize;
        let bytes = self.take(len)?;
        String::from_utf8(bytes.to_vec()).map_err(|e| AppError::Kn5Parse(e.to_string()))
    }

    fn overflow(&self, wanted: usize) -> AppError {
        AppError::Kn5Parse(format!(
            "unexpected end of KN5: wanted {wanted} bytes at {} of {}",
            self.pos,
            self.data.len()
        ))
    }
}
