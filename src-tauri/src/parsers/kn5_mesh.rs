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

/// A car's node tree is a handful of levels deep; this is only there to stop a
/// malformed one recursing until the stack gives out.
const MAX_NODE_DEPTH: u32 = 256;

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
    read_node(&mut r, &mut meshes, IDENTITY, 0)?;

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
    // An active slot is at least its flag, two lengths and nothing else.
    let count = r.counted(4)?;
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
    // A material is at least a name length, a shader length and two flag bytes.
    let count = r.counted(10)?;
    let mut materials = Vec::with_capacity(count);

    for _ in 0..count {
        let name = r.string()?;
        let _shader = r.string()?;
        r.skip(2)?; // alpha blend mode, alpha tested
        if version > 4 {
            r.skip(4)?; // depth mode
        }

        let prop_count = r.counted(4 + 4 * 10)?;
        for _ in 0..prop_count {
            let _prop_name = r.string()?;
            r.skip(4 * 10)?; // one float, then a vec2, a vec3 and a vec4
        }

        // A slot is at least two name lengths and the slot index between them.
        let texture_count = r.counted(12)?;
        let mut textures = Vec::with_capacity(texture_count);
        for _ in 0..texture_count {
            let sampler = r.string()?;
            r.skip(4)?; // slot
            textures.push((sampler, r.string()?));
        }

        materials.push(Material { name, textures });
    }

    Ok(materials)
}

fn read_node(
    r: &mut Reader,
    out: &mut Vec<UvMesh>,
    parent: Matrix,
    depth: u32,
) -> Result<(), AppError> {
    const DUMMY: u32 = 1;
    const MESH: u32 = 2;
    const SKINNED_MESH: u32 = 3;

    // One stack frame per level, and a malformed file is free to describe a
    // chain long enough to overflow it — which aborts the process rather than
    // failing the command.
    if depth > MAX_NODE_DEPTH {
        return Err(AppError::Kn5Parse(format!(
            "KN5 node tree deeper than {MAX_NODE_DEPTH} at byte {}",
            r.pos
        )));
    }

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
        read_node(r, out, transform, depth + 1)?;
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
        let bone_count = r.counted(4 + 4 * 16)?;
        for _ in 0..bone_count {
            let _bone_name = r.string()?;
            r.skip(4 * 16)?; // inverse bind matrix
        }
    }

    let vertex_count = r.counted(vertex_size)?;
    let mut uvs = Vec::with_capacity(vertex_count);
    let mut positions = Vec::with_capacity(vertex_count);
    for _ in 0..vertex_count {
        let local = [r.f32()?, r.f32()?, r.f32()?];
        positions.push(apply(transform, local));
        r.skip(4 * 3)?; // normal
        uvs.push([r.f32()?, r.f32()?]);
        r.skip(vertex_size - CONSUMED_PER_VERTEX)?; // tangent, and any skin weights
    }

    let index_count = r.counted(2)?;
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

    /// A count read out of the file decides how much is reserved up front, so a
    /// corrupt one asks for gigabytes and aborts on allocation failure instead
    /// of returning an error the command could report. Nothing in the file can
    /// be longer than the bytes left in it.
    fn counted(&mut self, bytes_each: usize) -> Result<usize, AppError> {
        let count = self.u32()? as usize;
        let remaining = self.data.len().saturating_sub(self.pos);
        if bytes_each > 0 && count > remaining / bytes_each {
            return Err(AppError::Kn5Parse(format!(
                "KN5 declares {count} items at byte {} with only {remaining} bytes left",
                self.pos
            )));
        }
        Ok(count)
    }

    fn overflow(&self, wanted: usize) -> AppError {
        AppError::Kn5Parse(format!(
            "unexpected end of KN5: wanted {wanted} bytes at {} of {}",
            self.pos,
            self.data.len()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Writes the byte layout `read_geometry` expects, so a test can describe a
    /// KN5 by what it contains rather than by a fixture nobody can read.
    #[derive(Default)]
    struct Kn5Builder {
        out: Vec<u8>,
    }

    impl Kn5Builder {
        fn header(version: u32) -> Self {
            let mut builder = Self::default();
            builder.out.extend_from_slice(b"sc6969");
            builder.u32(version);
            if version > 5 {
                builder.u32(0); // the extra word only versions past 5 carry
            }
            builder
        }

        fn u32(&mut self, value: u32) -> &mut Self {
            self.out.extend_from_slice(&value.to_le_bytes());
            self
        }

        fn u16(&mut self, value: u16) -> &mut Self {
            self.out.extend_from_slice(&value.to_le_bytes());
            self
        }

        fn f32(&mut self, value: f32) -> &mut Self {
            self.out.extend_from_slice(&value.to_le_bytes());
            self
        }

        fn bytes(&mut self, count: usize) -> &mut Self {
            self.out.extend(std::iter::repeat_n(0u8, count));
            self
        }

        fn string(&mut self, value: &str) -> &mut Self {
            self.u32(value.len() as u32);
            self.out.extend_from_slice(value.as_bytes());
            self
        }

        /// `active` slots carry a name and a payload; an inactive one is the flag
        /// and nothing else, and reading a name for it walks off the layout.
        fn textures(&mut self, slots: &[(bool, &str)]) -> &mut Self {
            self.u32(slots.len() as u32);
            for (active, name) in slots {
                if !active {
                    self.u32(0);
                    continue;
                }
                self.u32(1);
                self.string(name);
                self.u32(4);
                self.bytes(4);
            }
            self
        }

        fn materials(&mut self, materials: &[(&str, &[(&str, &str)])], version: u32) -> &mut Self {
            self.u32(materials.len() as u32);
            for (name, textures) in materials {
                self.string(name);
                self.string("ksPerPixel");
                self.bytes(2);
                if version > 4 {
                    self.bytes(4);
                }
                self.u32(0); // no properties
                self.u32(textures.len() as u32);
                for (sampler, file) in *textures {
                    self.string(sampler);
                    self.u32(0);
                    self.string(file);
                }
            }
            self
        }

        fn dummy(&mut self, name: &str, children: u32, offset: [f32; 3]) -> &mut Self {
            self.u32(1);
            self.string(name);
            self.u32(children);
            self.bytes(1);
            for (row, value) in [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0]
                .into_iter()
                .enumerate()
            {
                let _ = row;
                self.f32(value);
            }
            self.f32(offset[0]).f32(offset[1]).f32(offset[2]).f32(1.0);
            self
        }

        fn mesh(
            &mut self,
            name: &str,
            skinned: bool,
            material_id: u32,
            vertices: &[([f32; 3], [f32; 2])],
            indices: &[u16],
        ) -> &mut Self {
            self.u32(if skinned { 3 } else { 2 });
            self.string(name);
            self.u32(0); // no children
            self.bytes(1);
            self.bytes(3); // cast shadows, visible, transparent

            if skinned {
                self.u32(0); // no bones
            }

            let trailer = if skinned { 76 } else { 44 } - 4 * 8;
            self.u32(vertices.len() as u32);
            for (position, uv) in vertices {
                for axis in position {
                    self.f32(*axis);
                }
                self.bytes(4 * 3); // normal
                self.f32(uv[0]).f32(uv[1]);
                self.bytes(trailer);
            }

            self.u32(indices.len() as u32);
            for index in indices {
                self.u16(*index);
            }

            self.u32(material_id);
            self.bytes(4); // layer
            self.bytes(8); // lod in and out
            if !skinned {
                self.bytes(4 * 4); // bounding sphere
                self.bytes(1); // is renderable
            }
            self
        }

        fn read(&self) -> Result<Kn5Geometry, AppError> {
            let file = tempfile::NamedTempFile::new().unwrap();
            std::fs::write(file.path(), &self.out).unwrap();
            read_geometry(file.path())
        }
    }

    fn one_triangle() -> Vec<([f32; 3], [f32; 2])> {
        vec![
            ([0.0, 0.0, 0.0], [0.0, 0.0]),
            ([1.0, 0.0, 0.0], [1.0, 0.0]),
            ([0.0, 1.0, 0.0], [0.0, 1.0]),
        ]
    }

    fn car(version: u32) -> Kn5Builder {
        let mut builder = Kn5Builder::header(version);
        builder
            .textures(&[(true, "body.dds")])
            .materials(&[("paint", &[("txDiffuse", "body.dds")])], version);
        builder
    }

    #[test]
    fn a_mesh_keeps_its_uvs_and_its_material() {
        let mut builder = car(5);
        builder.mesh("BODY", false, 0, &one_triangle(), &[0, 1, 2]);
        let geometry = builder.read().unwrap();

        assert_eq!(geometry.meshes.len(), 1);
        assert_eq!(geometry.meshes[0].name, "BODY");
        assert_eq!(geometry.meshes[0].material_id, 0);
        assert_eq!(
            geometry.meshes[0].uvs,
            vec![[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]]
        );
        assert_eq!(geometry.meshes[0].indices, vec![0, 1, 2]);
    }

    /// Versions past 5 open with an extra word before the texture table; reading
    /// it as the table's own count walks the rest of the file off its layout.
    #[test]
    fn a_version_past_five_carries_an_extra_word_the_older_ones_do_not() {
        let mut builder = car(6);
        builder.mesh("BODY", false, 0, &one_triangle(), &[0, 1, 2]);

        assert_eq!(builder.read().unwrap().meshes[0].name, "BODY");
    }

    /// An inactive slot is the flag alone, with no name and no payload after it.
    #[test]
    fn an_inactive_texture_slot_carries_nothing_to_skip() {
        let version = 5;
        let mut builder = Kn5Builder::header(version);
        builder
            .textures(&[(false, ""), (true, "body.dds"), (false, "")])
            .materials(&[("paint", &[("txDiffuse", "body.dds")])], version)
            .mesh("BODY", false, 0, &one_triangle(), &[0, 1, 2]);

        assert_eq!(builder.read().unwrap().materials.len(), 1);
    }

    /// A skinned vertex carries bone weights, which widens it from 44 bytes to
    /// 76 — the UV pair sits at the same offset, everything after it does not.
    #[test]
    fn a_skinned_mesh_reads_on_the_wider_vertex_stride() {
        let mut builder = car(5);
        builder.mesh("DRIVER", true, 0, &one_triangle(), &[0, 1, 2]);
        let geometry = builder.read().unwrap();

        assert_eq!(
            geometry.meshes[0].uvs,
            vec![[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]]
        );
        assert_eq!(geometry.meshes[0].material_id, 0);
    }

    /// A KN5 places a wheel or a wing by its node, not by its vertices, so a
    /// mesh read without its parents' transforms sits at the centre of the car.
    #[test]
    fn a_node_moves_the_meshes_beneath_it() {
        let mut builder = car(5);
        builder.dummy("root", 1, [10.0, 0.0, 0.0]).mesh(
            "WHEEL",
            false,
            0,
            &one_triangle(),
            &[0, 1, 2],
        );
        let geometry = builder.read().unwrap();

        assert_eq!(geometry.meshes[0].positions[0], [10.0, 0.0, 0.0]);
        assert_eq!(geometry.meshes[0].positions[1], [11.0, 0.0, 0.0]);
    }

    #[test]
    fn nested_nodes_compose_their_transforms() {
        let mut builder = car(5);
        builder
            .dummy("root", 1, [10.0, 0.0, 0.0])
            .dummy("axle", 1, [0.0, 5.0, 0.0])
            .mesh("WHEEL", false, 0, &one_triangle(), &[0, 1, 2]);

        assert_eq!(
            builder.read().unwrap().meshes[0].positions[0],
            [10.0, 5.0, 0.0]
        );
    }

    #[test]
    fn a_sibling_is_not_moved_by_the_node_before_it() {
        let mut builder = car(5);
        builder.dummy("root", 2, [0.0, 0.0, 0.0]);
        builder.dummy("axle", 1, [0.0, 5.0, 0.0]).mesh(
            "WHEEL",
            false,
            0,
            &one_triangle(),
            &[0, 1, 2],
        );
        builder.mesh("BODY", false, 0, &one_triangle(), &[0, 1, 2]);
        let geometry = builder.read().unwrap();

        assert_eq!(geometry.meshes[0].positions[0], [0.0, 5.0, 0.0]);
        assert_eq!(geometry.meshes[1].positions[0], [0.0, 0.0, 0.0]);
    }

    #[test]
    fn meshes_using_finds_a_texture_whatever_case_the_material_names_it_in() {
        let version = 5;
        let mut builder = Kn5Builder::header(version);
        builder
            .textures(&[(true, "body.dds")])
            .materials(
                &[
                    ("paint", &[("txDiffuse", "Body.DDS")]),
                    ("glass", &[("txDiffuse", "glass.dds")]),
                ],
                version,
            )
            .dummy("root", 2, [0.0, 0.0, 0.0]);
        builder.mesh("BODY", false, 0, &one_triangle(), &[0, 1, 2]);
        builder.mesh("GLASS", false, 1, &one_triangle(), &[0, 1, 2]);
        let geometry = builder.read().unwrap();

        let found = geometry.meshes_using("body.dds");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "BODY");
    }

    #[test]
    fn meshes_using_finds_nothing_for_a_texture_no_material_names() {
        let mut builder = car(5);
        builder.mesh("BODY", false, 0, &one_triangle(), &[0, 1, 2]);

        assert!(builder
            .read()
            .unwrap()
            .meshes_using("absent.dds")
            .is_empty());
    }

    #[test]
    fn a_file_that_is_not_a_kn5_is_refused() {
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), b"not a kn5 at all").unwrap();

        assert!(read_geometry(file.path()).is_err());
    }

    #[test]
    fn an_unknown_node_class_is_refused_rather_than_guessed_at() {
        let mut builder = car(5);
        builder.u32(99).string("mystery").u32(0).bytes(1);

        assert!(builder.read().is_err());
    }

    /// A corrupt count would otherwise reserve gigabytes and abort the process
    /// on allocation failure, where an error can still be reported.
    #[test]
    fn a_count_longer_than_the_file_is_refused_before_it_is_reserved() {
        let version = 5;
        let mut builder = Kn5Builder::header(version);
        builder.textures(&[]).u32(u32::MAX); // material count

        assert!(builder.read().is_err());
    }

    #[test]
    fn a_vertex_count_longer_than_the_file_is_refused() {
        let mut builder = car(5);
        builder
            .u32(2)
            .string("BODY")
            .u32(0)
            .bytes(1)
            .bytes(3)
            .u32(u32::MAX);

        assert!(builder.read().is_err());
    }

    /// One stack frame per level, and the tree's depth comes out of the file.
    #[test]
    fn a_node_tree_deeper_than_the_bound_is_refused_rather_than_recursed_into() {
        let mut builder = car(5);
        for level in 0..(MAX_NODE_DEPTH + 2) {
            builder.dummy(&format!("level_{level}"), 1, [0.0, 0.0, 0.0]);
        }

        let Err(error) = builder.read() else {
            panic!("a tree past the bound must not be walked");
        };
        assert!(error.to_string().contains("deeper than"), "{error}");
    }
}
