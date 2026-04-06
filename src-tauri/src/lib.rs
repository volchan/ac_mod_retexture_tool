pub mod commands;
pub mod converters;
pub mod errors;
pub mod models;
pub mod parsers;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::scan::scan_mod_folder,
            commands::decode::decode_mod_textures,
            commands::track_hero::get_track_hero_image,
            commands::track_hero::extract_track_hero_image,
            commands::track_hero::preview_replacement_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
