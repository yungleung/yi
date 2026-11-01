//! Maps native menu item IDs to app events.
//!
//! Example: the item ID `export_pdf` emits `export` with payload `pdf`, which the webview maps to
//! the export command for that kind.
//!
//! May import: Tauri event/dialog APIs. Upholds: each menu item has one wire name and one event.

use tauri::{App, AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

pub(super) fn export_item_id(kind: &str) -> String {
    format!("export_{kind}")
}

fn kind_of_export_item(id: &str) -> Option<&str> {
    id.strip_prefix("export_")
}

pub(super) fn install(app: &mut App) {
    app.on_menu_event(move |app_handle: &AppHandle, event| {
        handle(app_handle, event.id().0.as_str());
    });
}

fn handle(app_handle: &AppHandle, id: &str) {
    println!("menu event: {id}");
    if let Some(kind) = kind_of_export_item(id) {
        app_handle.emit("export", kind.to_string()).unwrap();
        return;
    }
    match id {
        "tutorial" => emit(app_handle, "tutorial"),
        "settings" => emit(app_handle, "setting"),
        "new_markdown" => emit(app_handle, "new_markdown"),
        "open_file" => {
            let app_handle = app_handle.clone();
            app_handle
                .dialog()
                .file()
                .add_filter("files", &["md", "markdown"])
                .pick_file(move |file_path| {
                    if let Some(file) = file_path {
                        app_handle.emit("open_file", file).unwrap();
                    }
                });
        }
        "open_folder" => {
            let app_handle = app_handle.clone();
            app_handle.dialog().file().pick_folder(move |folder_path| {
                if let Some(folder) = folder_path {
                    app_handle.emit("open_folder", folder).unwrap();
                }
            });
        }
        "save" => emit(app_handle, "save"),
        "save_as" => emit(app_handle, "save_as"),
        "version_save" => emit(app_handle, "version_save"),
        "manage_export_templates" => emit(app_handle, "manage_export_templates"),
        "undo" => emit(app_handle, "undo"),
        "redo" => emit(app_handle, "redo"),
        "cut" => emit(app_handle, "cut"),
        "select_all" => emit(app_handle, "select_all"),
        "find" => emit(app_handle, "find"),
        "replace" => emit(app_handle, "replace"),
        "toggle_stack" => emit(app_handle, "toggle_stack"),
        "next_stacked" => emit(app_handle, "next_stacked"),
        "previous_stacked" => emit(app_handle, "previous_stacked"),
        "documentation" => emit(app_handle, "documentation"),
        "report_issue" => emit(app_handle, "report_issue"),
        "check_for_updates" => emit(app_handle, "check_for_updates"),
        _ => println!("unexpected menu event"),
    }
}

fn emit(app_handle: &AppHandle, event: &str) {
    app_handle.emit(event, ()).unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_export_items_id_is_the_kind_the_handler_reads_back() {
        for kind in crate::export::KINDS {
            assert_eq!(
                kind_of_export_item(&export_item_id(kind.kind)),
                Some(kind.kind),
                "{} does not round-trip through its own menu item's id",
                kind.kind
            );
        }
        for other in [
            "save",
            "version_save",
            "manage_export_templates",
            "export",
            "settings",
        ] {
            assert_eq!(kind_of_export_item(other), None, "{other}");
        }
    }
}
