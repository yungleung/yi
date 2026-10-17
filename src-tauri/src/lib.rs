mod i18n;
mod menu;
mod files;
mod access;
mod export;
mod export_fonts;
mod font_file;
mod system_fonts;
mod session;
mod stats;
mod settings;
mod versioning;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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
            files::create_entry,
            files::delete_entry,
            files::move_entry,
            files::rename_entry,
            files::write_text_atomically,
            stats::get_word_count, 
            files::list_folder_files, 
            access::grant_folder,
            session::load_session,
            session::save_session,
            session::focus_window,
            settings::get_config,
            settings::set_config,
            settings::get_current_config_version,
            settings::read_bibliography,
            export::export_kinds,
            export::run_export,
            export::export_config_path,
            export::export_restore_config,
            export::export_named_fonts,
            export::export_font_for,
            export::export_fetch_image,
            export::export_use_pandoc,
            export::export_use_curl,
            versioning::versioning_facts,
            versioning::versioning_use_git,
            versioning::versioning_history,
            versioning::versioning_version_text,
            versioning::init_workspace_repository,
            versioning::commit_paths,])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
