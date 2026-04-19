pub mod commands;
pub mod converters;
pub mod errors;
pub mod models;
pub mod parsers;

use std::sync::{atomic::AtomicBool, Arc};

pub struct DecodeCancel(pub Arc<AtomicBool>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(DecodeCancel(Arc::new(AtomicBool::new(false))))
        .invoke_handler(tauri::generate_handler![
            commands::scan::scan_mod_folder,
            commands::decode::decode_mod_textures,
            commands::decode::cancel_decode,
            commands::extract::extract_textures,
            commands::track_hero::list_track_hero_images,
            commands::track_hero::get_track_hero_image,
            commands::track_hero::extract_track_hero_image,
            commands::track_hero::preview_replacement_image,
            commands::import::scan_import_folder,
            commands::repack::repack_mod,
            commands::texture::get_kn5_texture,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
