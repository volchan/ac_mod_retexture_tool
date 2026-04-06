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
        .invoke_handler(tauri::generate_handler![commands::scan::scan_mod_folder])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
