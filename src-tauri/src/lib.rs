mod menu;
mod files;
mod greeting;
mod stats;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .setup(|app| {
            // Set the main menu for the application
            menu::set_as_main_menu(app)
        })
        .invoke_handler(tauri::generate_handler![
            stats::get_word_count, 
            files::list_folder_files, 
            greeting::greet,
            settings::get_config,
            settings::set_config,
            settings::get_current_config_version,])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
