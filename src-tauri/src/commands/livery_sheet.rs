//! Which of a car's sheets carries its livery.
//!
//! Measured from the model, because the files cannot answer it: a car ships
//! masks and paint maps at the livery's own resolution, and `EXT_Series_Mask.png`
//! is the same 7168x3584 as the sheet beside it — while the sheet itself may not
//! be in a skin's folder at all, as on a stock car that keeps it in the KN5.

use std::path::Path;

use crate::commands::car_model::main_kn5;
use crate::commands::livery_textures::DIFFUSE_SAMPLER;
use crate::errors::AppError;
use crate::parsers::kn5_mesh::{read_geometry, Kn5Geometry, Material, UvMesh};

/// The file the car wears its livery on.
#[tauri::command]
pub async fn main_livery_texture(car_path: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let geometry = read_geometry(&main_kn5(Path::new(&car_path))?)?;
        Ok::<Option<String>, AppError>(livery_texture(&geometry))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// The sheet this car wears its livery on, as the model names it.
///
/// Paint is the outermost shell: every other part of a car — the engine bay, the
/// cockpit, the glass — sits inside the bodywork, so the meshes wearing the
/// livery enclose the largest box. That is the invariant, and it is the only one
/// that held across every car tried.
///
/// The obvious measures do not. Triangle count hands the F40 its engine bay,
/// which is thousands of tiny parts; surface area hands it the same, because
/// those parts sum to more than the panels over them; and a bounding box on its
/// own hands an F1 car a decal scattered from nose to wing over a third of a
/// square metre. So: colour maps only, those carrying real area only, widest box
/// wins, and area breaks a tie between a body and the carbon sharing it.
pub fn livery_texture(geometry: &Kn5Geometry) -> Option<String> {
    let mut worn: Vec<Worn> = diffuse_textures(geometry)
        .into_iter()
        .map(|name| Worn::measure(geometry, name))
        .collect();

    let widest = worn.iter().map(|w| w.area).fold(0.0, f32::max);
    worn.retain(|w| w.area >= widest * MEANINGFUL_SHARE);

    worn.sort_by(|a, b| b.shell.total_cmp(&a.shell).then(b.area.total_cmp(&a.area)));
    worn.into_iter().next().map(|w| w.name)
}

/// Below this share of the largest painted surface, a texture is trim rather
/// than bodywork — a rivet, a logo, a decal. Its box can still span the car.
const MEANINGFUL_SHARE: f32 = 0.1;

struct Worn {
    name: String,
    /// Volume of the box enclosing every mesh wearing it.
    shell: f32,
    /// Surface of those meshes, in the car's own space.
    area: f32,
}

impl Worn {
    fn measure(geometry: &Kn5Geometry, name: String) -> Self {
        let meshes = geometry.meshes_using(&name);

        Self {
            shell: shell_of(&meshes),
            area: meshes.iter().map(|mesh| surface_of(mesh)).sum(),
            name,
        }
    }
}

/// Every texture the car wears as a colour map. A mask or a paint map is
/// sampled through another slot, or not by the renderer at all.
fn diffuse_textures(geometry: &Kn5Geometry) -> Vec<String> {
    let mut names: Vec<String> = geometry.materials.iter().filter_map(diffuse_of).collect();
    names.sort();
    names.dedup();
    names
}

fn shell_of(meshes: &[&UvMesh]) -> f32 {
    let mut low = [f32::MAX; 3];
    let mut high = [f32::MIN; 3];

    for mesh in meshes {
        for point in &mesh.positions {
            for axis in 0..3 {
                low[axis] = low[axis].min(point[axis]);
                high[axis] = high[axis].max(point[axis]);
            }
        }
    }

    (0..3).map(|axis| (high[axis] - low[axis]).max(0.0)).product()
}

fn surface_of(mesh: &UvMesh) -> f32 {
    mesh.indices
        .chunks_exact(3)
        .filter_map(|face| {
            let a = *mesh.positions.get(face[0] as usize)?;
            let b = *mesh.positions.get(face[1] as usize)?;
            let c = *mesh.positions.get(face[2] as usize)?;
            Some(triangle_area(a, b, c))
        })
        .sum()
}

/// Half the length of the cross product of two edges.
fn triangle_area(a: [f32; 3], b: [f32; 3], c: [f32; 3]) -> f32 {
    let u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];

    let cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
    ];

    (cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]).sqrt() / 2.0
}

fn diffuse_of(material: &Material) -> Option<String> {
    material
        .textures
        .iter()
        .find(|(sampler, _)| sampler.eq_ignore_ascii_case(DIFFUSE_SAMPLER))
        .map(|(_, texture)| texture.clone())
}


#[cfg(test)]
mod tests {
    use super::*;

    fn worn(texture: &str, size: [f32; 3], area: f32) -> UvMesh {
        let face = size[0] * size[1] / 2.0;
        let repeats = (area / face).round().max(1.0) as usize;

        UvMesh {
            name: texture.to_string(),
            material_id: 0,
            uvs: vec![[0.0, 0.0]; 4],
            positions: vec![
                [0.0, 0.0, 0.0],
                size,
                [size[0], 0.0, 0.0],
                [0.0, size[1], 0.0],
            ],
            // The first face is degenerate and only stretches the box.
            indices: [vec![0, 1, 0], [0, 2, 3].repeat(repeats)].concat(),
        }
    }

    fn car(sheets: &[(&str, [f32; 3], f32)]) -> Kn5Geometry {
        let mut materials = Vec::new();
        let mut meshes = Vec::new();

        for (id, (texture, size, area)) in sheets.iter().enumerate() {
            let mut mesh = worn(texture, *size, *area);
            mesh.material_id = id as u32;
            meshes.push(mesh);
            materials.push(Material {
                name: format!("mat_{id}"),
                textures: vec![("txDiffuse".to_string(), (*texture).to_string())],
            });
        }

        Kn5Geometry { materials, meshes }
    }

    /// The invariant: paint is the outermost shell, and everything else on a car
    /// sits inside the bodywork.
    #[test]
    fn the_sheet_on_the_outermost_shell_is_the_livery() {
        let model = car(&[
            ("EXT_Mechanics.dds", [1.88, 0.93, 4.60], 24.09),
            ("Skin_00.dds", [2.00, 1.24, 4.66], 17.51),
        ]);

        assert_eq!(livery_texture(&model).as_deref(), Some("Skin_00.dds"));
    }

    /// An F1 car scatters one decal from nose to wing over a third of a square
    /// metre: its box spans everything and it is not the paint.
    #[test]
    fn a_decal_spanning_the_car_does_not_pass_for_bodywork() {
        let model = car(&[
            ("ferrari_details_d.dds", [2.0, 1.0, 5.4], 0.33),
            ("carbon1_diffuse.dds", [2.0, 1.0, 5.3], 23.70),
        ]);

        assert_eq!(livery_texture(&model).as_deref(), Some("carbon1_diffuse.dds"));
    }

    /// A body and the carbon over it share the same shell, so the tie falls to
    /// whichever covers more of it.
    #[test]
    fn a_shell_shared_with_its_carbon_goes_to_the_wider_surface() {
        let model = car(&[
            ("MAT_Carbon.dds", [2.0, 1.3, 4.7], 20.79),
            ("Skin_00.dds", [2.0, 1.3, 4.7], 25.94),
        ]);

        assert_eq!(livery_texture(&model).as_deref(), Some("Skin_00.dds"));
    }

    /// A series mask ships at the livery's own resolution, so no measuring of
    /// the files tells them apart. The model never hangs it on a colour slot.
    #[test]
    fn a_texture_the_car_never_wears_as_colour_is_left_out() {
        let mut model = car(&[("2026_Chassis_P.dds", [2.0, 1.2, 4.6], 45.70)]);
        model.materials.push(Material {
            name: "mask".to_string(),
            textures: vec![("txMask".to_string(), "EXT_Series_Mask.png".to_string())],
        });

        assert_eq!(livery_texture(&model).as_deref(), Some("2026_Chassis_P.dds"));
    }

    #[test]
    fn a_sampler_is_matched_whatever_case_the_exporter_spelled_it_in() {
        let mut model = car(&[("body.dds", [2.0, 1.0, 4.0], 12.0)]);
        model.materials[0].textures[0].0 = "TXDIFFUSE".to_string();

        assert_eq!(livery_texture(&model).as_deref(), Some("body.dds"));
    }

    #[test]
    fn a_car_whose_materials_wear_nothing_names_nothing() {
        let model = Kn5Geometry {
            materials: vec![Material {
                name: "shadow".to_string(),
                textures: vec![],
            }],
            meshes: vec![],
        };

        assert!(livery_texture(&model).is_none());
    }
}
