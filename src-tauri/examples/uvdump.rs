//! Development probe: dumps the textures a car model references, or renders the
//! UV template for one of them.
use std::path::Path;

use ac_mod_toolkit_lib::converters::uv_template;
use ac_mod_toolkit_lib::parsers::kn5_mesh::read_geometry;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let started = std::time::Instant::now();
    let geo = read_geometry(Path::new(&args[1])).expect("parse");
    println!("parsed in {:?}", started.elapsed());

    let Some(texture) = args.get(2) else {
        for mat in &geo.materials {
            for (_, tex) in &mat.textures {
                let meshes = geo.meshes_using(tex);
                println!("  {tex:40} meshes={}", meshes.len());
            }
        }
        return;
    };

    let w: u32 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(2048);
    let h: u32 = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(w);
    let meshes = geo.meshes_using(texture);
    let mut lo = [f32::MAX; 3];
    let mut hi = [f32::MIN; 3];
    for m in &meshes {
        for p in &m.positions {
            for axis in 0..3 {
                lo[axis] = lo[axis].min(p[axis]);
                hi[axis] = hi[axis].max(p[axis]);
            }
        }
    }
    let verts: usize = meshes.iter().map(|m| m.positions.len()).sum();
    let idx: usize = meshes.iter().map(|m| m.indices.len()).sum();
    println!(
        "verts={verts} indices={idx} payload={:.1} MB",
        (verts * 20 + idx * 4) as f64 / 1e6
    );
    println!(
        "bounds  x {:.2}..{:.2}  y {:.2}..{:.2}  z {:.2}..{:.2}",
        lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]
    );
    let drawn = std::time::Instant::now();
    let img = uv_template::render(&meshes, w, h);
    println!("{} meshes rendered in {:?}", meshes.len(), drawn.elapsed());

    let out = format!("/tmp/uv_{}.png", texture.replace(['.', '/'], "_"));
    img.save(&out).expect("save");
    println!("-> {out}  (total {:?})", started.elapsed());
}
