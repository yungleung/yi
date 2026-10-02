use std::error::Error;
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{App, AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

use crate::i18n::{language_for, t};
use crate::settings::load_config;

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
        .text("export", t(language, "menu.file.export", &[]))
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
        .fullscreen_with_text(t(language, "menu.view.fullscreen", &[]))
        .build()?;

    let window_submenu = SubmenuBuilder::new(app, t(language, "menu.window", &[]))
        .minimize_with_text(t(language, "menu.window.minimize", &[]))
        .maximize_with_text(t(language, "menu.window.maximize", &[]))
        .separator()
        .close_window_with_text(t(language, "menu.window.close", &[]))
        .build()?;

    let help_submenu = SubmenuBuilder::new(app, t(language, "menu.help", &[]))
        .text("documentation", t(language, "menu.help.documentation", &[]))
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

        match event.id().0.as_str() {
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
            "export" => {
                app_handle.emit("export", ()).unwrap();
            }
            "find" => {
                app_handle.emit("find", ()).unwrap();
            }
            "replace" => {
                app_handle.emit("replace", ()).unwrap();
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
