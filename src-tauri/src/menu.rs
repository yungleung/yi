use std::error::Error;
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{App, AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

use crate::i18n::{language_for, t};
use crate::settings::load_config;

/// The Export submenu: one item per kind the app ships, in the order the kinds are declared.
///
/// The kinds are not a fact of this menu — they are `export::KINDS`, so a kind added there appears
/// here without this file changing, and each item's label is that kind's own word from the same
/// catalogues the window reads (`export.kind.<kind>`). An item's id is `export_<kind>`, which is what
/// reaches the webview as the event `export` carrying that kind — so *which* kind is exported is
/// decided in the menu, before any card is drawn.
fn export_submenu(
    app: &AppHandle,
    language: &str,
) -> Result<tauri::menu::Submenu<tauri::Wry>, Box<dyn Error>> {
    let mut submenu = SubmenuBuilder::new(app, t(language, "menu.file.export", &[]));
    for kind in crate::export::KINDS {
        submenu = submenu.text(
            export_item_id(kind.kind),
            t(language, &format!("export.kind.{}", kind.kind), &[]),
        );
    }
    Ok(submenu.build()?)
}

/// The id an *Export* item carries (`export_<kind>`), and the kind read back off one.
///
/// One wire, one home: the menu that writes the id and the handler that reads it are the two ends of
/// it, and they are one line apart so neither can drift from the other. An id is never translated —
/// it is what the window's menu bridge maps to a command (`src/ui/markdown/commands/menu.ts`), and
/// what the event's payload is read off.
fn export_item_id(kind: &str) -> String {
    format!("export_{kind}")
}

/// The kind an *Export* item's id names, or `None` when the id belongs to some other item — which is
/// most of them, and none of them is read as a kind.
fn kind_of_export_item(id: &str) -> Option<&str> {
    id.strip_prefix("export_")
}

/// The app menu, in the language the app is speaking.
///
/// Every label comes from the catalogue (`src-tauri/src/i18n.rs`, over the same files the webview
/// reads), because Tauri's own defaults are English: a predefined item whose text is left out is
/// titled by `muda`'s table, which says "Copy" and "Quit Yi" whatever language the rest of the app
/// is in. The accelerators and the item *ids* are not translated — an id is what the webview's
/// bridge maps to a command (`src/ui/markdown/commands/menu.ts`) and what a keystroke reaches.
pub fn build(app: &AppHandle, language: &str) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn Error>> {
    let yi_submenu = SubmenuBuilder::new(app, "Yi")
        .about_with_text(
            t(language, "menu.about", &[]),
            Some(AboutMetadata {
                name: Some(String::from("Yi")),
                version: Some(String::from(env!("CARGO_PKG_VERSION"))),
                short_version: None,
                authors: Some(vec![String::from(env!("CARGO_PKG_AUTHORS"))]),
                comments: None,
                copyright: None,
                license: None,
                website: None,
                website_label: None,
                credits: None,
                icon: None,
            }),
        )
        .separator()
        .text("settings", t(language, "menu.settings", &[]))
        .separator()
        .hide_with_text(t(language, "menu.hide", &[]))
        .hide_others_with_text(t(language, "menu.hideOthers", &[]))
        .show_all_with_text(t(language, "menu.showAll", &[]))
        .separator()
        .quit_with_text(t(language, "menu.quit", &[]))
        .build()?;

    let file_submenu = SubmenuBuilder::new(app, t(language, "menu.file", &[]))
        .item(
            &MenuItemBuilder::new(t(language, "menu.file.newMarkdown", &[]))
                .accelerator("CmdOrCtrl+N")
                .id("new_markdown")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::new(t(language, "menu.file.open", &[]))
                .accelerator("CmdOrCtrl+O")
                .id("open_file")
                .build(app)?,
        )
        .text("open_folder", t(language, "menu.file.openFolder", &[]))
        .separator()
        .item(
            &MenuItemBuilder::new(t(language, "menu.file.save", &[]))
                .accelerator("CmdOrCtrl+S")
                .id("save")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::new(t(language, "menu.file.saveAs", &[]))
                .accelerator("CmdOrCtrl+Shift+S")
                .id("save_as")
                .build(app)?,
        )
        .text("version_save", t(language, "menu.file.saveVersion", &[]))
        .separator()
        .item(&export_submenu(app, language)?)
        .item(
            &MenuItemBuilder::new(t(language, "menu.file.manageExportTemplates", &[]))
                .id("manage_export_templates")
                .build(app)?,
        )
        .separator()
        .close_window_with_text(t(language, "menu.window.close", &[]))
        .build()?;

    let edit_submenu = SubmenuBuilder::new(app, t(language, "menu.edit", &[]))
        .item(
            &MenuItemBuilder::new(t(language, "menu.edit.undo", &[]))
                .accelerator("CmdOrCtrl+Z")
                .id("undo")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::new(t(language, "menu.edit.redo", &[]))
                .accelerator("CmdOrCtrl+Shift+Z")
                .id("redo")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::new(t(language, "menu.edit.cut", &[]))
                .accelerator("CmdOrCtrl+X")
                .id("cut")
                .build(app)?,
        )
        .copy_with_text(t(language, "menu.edit.copy", &[]))
        .paste_with_text(t(language, "menu.edit.paste", &[]))
        .item(
            &MenuItemBuilder::new(t(language, "menu.edit.selectAll", &[]))
                .accelerator("CmdOrCtrl+A")
                .id("select_all")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::new(t(language, "menu.edit.find", &[]))
                .accelerator("CmdOrCtrl+F")
                .id("find")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::new(t(language, "menu.edit.replace", &[]))
                .accelerator("CmdOrCtrl+Shift+F")
                .id("replace")
                .build(app)?,
        )
        .build()?;

    let view_submenu = SubmenuBuilder::new(app, t(language, "menu.view", &[]))
        .item(
            &MenuItemBuilder::new(t(language, "menu.view.toggleStack", &[]))
                .accelerator("CmdOrCtrl+P")
                .id("toggle_stack")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::new(t(language, "menu.view.nextStacked", &[]))
                .accelerator("CmdOrCtrl+T")
                .id("next_stacked")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::new(t(language, "menu.view.previousStacked", &[]))
                .accelerator("CmdOrCtrl+Shift+T")
                .id("previous_stacked")
                .build(app)?,
        )
        .separator()
        .fullscreen_with_text(t(language, "menu.view.fullscreen", &[]))
        .build()?;

    let window_submenu = SubmenuBuilder::new(app, t(language, "menu.window", &[]))
        .minimize_with_text(t(language, "menu.window.minimize", &[]))
        .maximize_with_text(t(language, "menu.window.maximize", &[]))
        .separator()
        .close_window_with_text(t(language, "menu.window.close", &[]))
        .build()?;

    let help_submenu = SubmenuBuilder::new(app, t(language, "menu.help", &[]))
        .text("tutorial", t(language, "menu.help.tutorial", &[]))
        .item(
            &MenuItemBuilder::new(t(language, "menu.help.documentation", &[]))
                .accelerator("F1")
                .id("documentation")
                .build(app)?,
        )
        .text("report_issue", t(language, "menu.help.reportIssue", &[]))
        .text(
            "check_for_updates",
            t(language, "menu.help.checkForUpdates", &[]),
        )
        .build()?;

    Ok(MenuBuilder::new(app)
        .items(&[
            &yi_submenu,
            &file_submenu,
            &edit_submenu,
            &view_submenu,
            &window_submenu,
            &help_submenu,
        ])
        .build()?)
}

/// Puts the app menu on the app, and wires every item to the event its id names.
pub fn set_as_main_menu(app: &mut App) -> Result<(), Box<dyn Error>> {
    set_menu_for_language(app.handle())?;

    app.on_menu_event(move |app_handle: &tauri::AppHandle, event| {
        println!("menu event: {:?}", event.id());

        // An Export submenu item names its kind (`export_<kind>`) and nothing else: the kind travels
        // with the event, so the window opens the card for the kind that was asked for.
        if let Some(kind) = kind_of_export_item(event.id().0.as_str()) {
            app_handle.emit("export", kind.to_string()).unwrap();
            return;
        }

        match event.id().0.as_str() {
            "tutorial" => {
                app_handle.emit("tutorial", ()).unwrap();
            }
            "settings" => {
                app_handle.emit("setting", ()).unwrap();
            }
            "new_markdown" => {
                app_handle.emit("new_markdown", ()).unwrap();
            }
            "open_file" => {
                let app_handle = app_handle.clone();
                app_handle.dialog().file().add_filter("files", &["md", "markdown"]).pick_file(move |file_path| {
                    if let Some(file) = file_path {
                        app_handle.emit("open_file", file).unwrap();
                    }
                })
            }
            "open_folder" => {
                let app_handle = app_handle.clone();
                app_handle.dialog().file().pick_folder(move |folder_path| {
                    if let Some(folder) = folder_path {
                        app_handle.emit("open_folder", folder).unwrap();
                    }
                })
            }
            "save" => {
                app_handle.emit("save", ()).unwrap();
            }
            "save_as" => {
                app_handle.emit("save_as", ()).unwrap();
            }
            "version_save" => {
                app_handle.emit("version_save", ()).unwrap();
            }
            "manage_export_templates" => {
                app_handle.emit("manage_export_templates", ()).unwrap();
            }
            "undo" => {
                app_handle.emit("undo", ()).unwrap();
            }
            "redo" => {
                app_handle.emit("redo", ()).unwrap();
            }
            "cut" => {
                app_handle.emit("cut", ()).unwrap();
            }
            "select_all" => {
                app_handle.emit("select_all", ()).unwrap();
            }
            "find" => {
                app_handle.emit("find", ()).unwrap();
            }
            "replace" => {
                app_handle.emit("replace", ()).unwrap();
            }
            "toggle_stack" => {
                app_handle.emit("toggle_stack", ()).unwrap();
            }
            "next_stacked" => {
                app_handle.emit("next_stacked", ()).unwrap();
            }
            "previous_stacked" => {
                app_handle.emit("previous_stacked", ()).unwrap();
            }
            "documentation" => {
                app_handle.emit("documentation", ()).unwrap();
            }
            "report_issue" => {
                app_handle.emit("report_issue", ()).unwrap();
            }
            "check_for_updates" => {
                app_handle.emit("check_for_updates", ()).unwrap();
            }
            _ => {
                println!("unexpected menu event");
            }
        }
    });

    Ok(())
}

/// Puts the menu on the app in the language the config asks for. Called when the app starts, and
/// again whenever the language changes — a menu is a tree of labels, so a new language is a new
/// menu.
pub fn set_menu_for_language(app: &AppHandle) -> Result<(), Box<dyn Error>> {
    let language = language_for(&load_config(app));
    let menu = build(app, &language)?;
    app.set_menu(menu)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A menu cannot be built without an app, so the one thing about the Export submenu a test *can*
    /// hold is the wire the window depends on: the id an item carries and the kind the handler reads
    /// back off it. A kind whose id does not round-trip is an item that opens nothing.
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
        // And the ids of the items beside them are not read as kinds — the menu is full of those.
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
