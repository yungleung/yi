mod access;
mod export;
mod files;
mod fonts;
mod i18n;
mod input_source;
mod menu;
mod session;
mod settings;
mod stats;
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
            input_source::install(app.handle());
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
            export::export_config_text,
            export::export_save_config_text,
            export::export_named_fonts,
            export::export_font_for,
            export::export_fetch_image,
            export::export_use_pandoc,
            export::export_use_revealjs_cdn,
            export::templates::export_templates,
            export::templates::export_template_inspect,
            export::templates::export_template_wrapper_preview,
            export::templates::export_template_import,
            export::templates::export_template_create_default,
            export::templates::export_template_duplicate,
            export::templates::export_template_remove,
            export::templates::export_template_update,
            export::templates::export_template_read,
            export::templates::export_template_write,
            export::templates::export_template_validate,
            export::templates::export_template_test_pdf,
            export::templates::export_template_takes_pdf,
            versioning::versioning_facts,
            versioning::versioning_use_git,
            versioning::versioning_history,
            versioning::versioning_version_text,
            versioning::init_workspace_repository,
            versioning::commit_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
