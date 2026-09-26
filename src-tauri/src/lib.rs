pub mod commands;
pub mod converters;
pub mod errors;
pub mod models;
pub mod parsers;

use std::sync::{atomic::AtomicBool, Arc};

use tauri::Manager;

pub struct DecodeCancel(pub Arc<AtomicBool>);
pub use commands::texture::Kn5Cache;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(DecodeCancel(Arc::new(AtomicBool::new(false))))
        .manage(Kn5Cache::default())
        .manage(commands::livery_serving::LiveryTextureState::default())
        .register_asynchronous_uri_scheme_protocol(
            commands::livery_serving::LIVERY_SCHEME,
            |ctx, request, responder| {
                let app = ctx.app_handle().clone();
                let path = request.uri().path().to_string();
                tauri::async_runtime::spawn_blocking(move || {
                    let state = app.state::<commands::livery_serving::LiveryTextureState>();
                    responder.respond(commands::livery_serving::serve_texture(&state, &path));
                });
            },
        )
        .invoke_handler(tauri::generate_handler![
            commands::scan::scan_mod_folder,
            commands::decode::decode_mod_textures,
            commands::decode::cancel_decode,
            commands::extract::extract_textures,
            commands::track_hero::list_track_hero_images,
            commands::track_hero::get_track_hero_image,
            commands::track_hero::extract_track_hero_image,
            commands::track_hero::preview_replacement_image,
            commands::track_hero::load_replacement_full,
            commands::track_hero::read_car_preview,
            commands::import::scan_import_folder,
            commands::repack::repack_mod,
            commands::texture::get_kn5_texture,
            commands::texture::get_skin_texture,
            commands::car_model::get_uv_template,
            commands::car_model::get_car_mesh,
            commands::fonts::list_system_fonts,
            commands::texture::clear_kn5_cache,
            commands::enhance::enhance_texture,
            commands::enhance::enhance_extracted_textures,
            commands::ac_detect::detect_ac_install,
            commands::ac_detect::validate_ac_folder,
            commands::ac_detect::list_ac_content,
            commands::ac_detect::list_ac_cars,
            commands::test_in_game::list_track_layouts,
            commands::test_in_game::test_in_game,
            commands::skin::list_car_skins,
            commands::livery_sheet::main_livery_texture,
            commands::skin_art::sample_texture_colours,
            commands::skin_art::write_skin_art,
            commands::skin_export::export_skin,
            commands::skin_test::test_skin_in_game,
            commands::ac_detect::list_ac_tracks,
            commands::livery_edit::save_livery_edit,
            commands::livery_edit::load_livery_document,
            commands::livery_maps::livery_maps,
            commands::livery_maps::clean_livery_maps,
            commands::livery_model::get_livery_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
