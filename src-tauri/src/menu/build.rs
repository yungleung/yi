//! Builds the application menu tree in one language.
//!
//! Example: adding a kind to `export::KINDS` adds its Export item without changing this file's
//! table of menu sections.
//!
//! May import: Tauri menu builders, i18n and the export kind catalogue. Upholds: labels are
//! translated while item IDs and accelerators remain stable wires to webview commands.

use std::error::Error;
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::AppHandle;

use super::events::export_item_id;
use crate::i18n::t;

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

pub(super) fn build(
    app: &AppHandle,
    language: &str,
) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn Error>> {
    let yi_submenu = SubmenuBuilder::new(app, "Yi")
        .about_with_text(
            t(language, "menu.about", &[]),
            Some(AboutMetadata {
                name: Some(String::from("Yi")),
                version: Some(String::from(env!("CARGO_PKG_VERSION"))),
                short_version: None,
                authors: Some(vec![String::from(env!("CARGO_PKG_AUTHORS"))]),
                comments: None,
                copyright: Some(String::from("Copyright © 2026 yungleung")),
                license: Some(String::from("MIT")),
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
