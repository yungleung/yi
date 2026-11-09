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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MenuPlatform {
    Macos,
    Windows,
    Linux,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct MenuProfile {
    application_menu: bool,
    fullscreen: bool,
    window_menu: bool,
    close_window: bool,
    file_quit: bool,
    toolbar_fallback: bool,
}

fn menu_profile(platform: MenuPlatform) -> MenuProfile {
    match platform {
        MenuPlatform::Macos => MenuProfile {
            application_menu: true,
            fullscreen: true,
            window_menu: true,
            close_window: true,
            file_quit: false,
            toolbar_fallback: false,
        },
        MenuPlatform::Windows => MenuProfile {
            application_menu: false,
            fullscreen: false,
            window_menu: true,
            close_window: true,
            file_quit: true,
            toolbar_fallback: true,
        },
        MenuPlatform::Linux => MenuProfile {
            application_menu: false,
            fullscreen: false,
            window_menu: false,
            close_window: false,
            file_quit: false,
            toolbar_fallback: true,
        },
    }
}

fn current_menu_platform() -> MenuPlatform {
    if cfg!(target_os = "macos") {
        MenuPlatform::Macos
    } else if cfg!(target_os = "windows") {
        MenuPlatform::Windows
    } else {
        MenuPlatform::Linux
    }
}

fn about_metadata() -> AboutMetadata<'static> {
    AboutMetadata {
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
    }
}

#[cfg(test)]
mod tests {
    use super::{menu_profile, MenuPlatform};

    #[test]
    fn macos_keeps_the_application_and_window_menus() {
        let profile = menu_profile(MenuPlatform::Macos);
        assert!(profile.application_menu);
        assert!(profile.fullscreen);
        assert!(profile.window_menu);
        assert!(profile.close_window);
        assert!(!profile.file_quit);
        assert!(!profile.toolbar_fallback);
    }

    #[test]
    fn windows_moves_app_actions_into_file_and_help() {
        let profile = menu_profile(MenuPlatform::Windows);
        assert!(!profile.application_menu);
        assert!(!profile.fullscreen);
        assert!(profile.window_menu);
        assert!(profile.close_window);
        assert!(profile.file_quit);
        assert!(profile.toolbar_fallback);
    }

    #[test]
    fn linux_omits_the_unsupported_native_items() {
        let profile = menu_profile(MenuPlatform::Linux);
        assert!(!profile.application_menu);
        assert!(!profile.fullscreen);
        assert!(!profile.window_menu);
        assert!(!profile.close_window);
        assert!(!profile.file_quit);
        assert!(profile.toolbar_fallback);
    }
}

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
    let profile = menu_profile(current_menu_platform());
    let yi_submenu = profile
        .application_menu
        .then(|| {
            SubmenuBuilder::new(app, "Yi")
                .about_with_text(t(language, "menu.about", &[]), Some(about_metadata()))
                .separator()
                .text("settings", t(language, "menu.settings", &[]))
                .separator()
                .hide_with_text(t(language, "menu.hide", &[]))
                .hide_others_with_text(t(language, "menu.hideOthers", &[]))
                .show_all_with_text(t(language, "menu.showAll", &[]))
                .separator()
                .quit_with_text(t(language, "menu.quit", &[]))
                .build()
        })
        .transpose()?;

    let mut file_submenu = SubmenuBuilder::new(app, t(language, "menu.file", &[]))
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
        );
    if !profile.application_menu {
        file_submenu = file_submenu
            .separator()
            .text("settings", t(language, "menu.settings", &[]));
    }
    if profile.close_window {
        file_submenu =
            file_submenu
                .separator()
                .close_window_with_text(t(language, "menu.window.close", &[]));
    }
    if profile.file_quit {
        file_submenu = file_submenu
            .separator()
            .quit_with_text(t(language, "menu.quit", &[]));
    }
    let file_submenu = file_submenu.build()?;

    let mut edit_submenu = SubmenuBuilder::new(app, t(language, "menu.edit", &[]))
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
        );
    if profile.toolbar_fallback {
        edit_submenu = edit_submenu
            .separator()
            .text("format_bold", t(language, "toolbar.bold", &[]))
            .text("format_italic", t(language, "toolbar.italic", &[]))
            .text(
                "format_strikethrough",
                t(language, "toolbar.strikethrough", &[]),
            )
            .text("format_inline_code", t(language, "toolbar.inlineCode", &[]))
            .separator()
            .text("insert_link", t(language, "toolbar.link", &[]))
            .text("insert_image", t(language, "toolbar.image", &[]))
            .text("insert_footnote", t(language, "toolbar.footnote", &[]))
            .text("choose_table", t(language, "toolbar.table", &[]))
            .separator()
            .text("list_ordered", t(language, "toolbar.orderedList", &[]))
            .text("list_bullet", t(language, "toolbar.bulletList", &[]))
            .text("list_task", t(language, "toolbar.taskList", &[]))
            .text("list_indent", t(language, "toolbar.indentItem", &[]));
    }
    let edit_submenu = edit_submenu.build()?;

    let mut view_submenu = SubmenuBuilder::new(app, t(language, "menu.view", &[]));
    if profile.toolbar_fallback {
        view_submenu = view_submenu
            .text("toggle_sidebar", t(language, "sidebar.toggle", &[]))
            .separator();
    }
    view_submenu = view_submenu
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
        );
    if profile.toolbar_fallback {
        view_submenu = view_submenu
            .separator()
            .text("open_stack", t(language, "session.open", &[]));
    }
    if profile.fullscreen {
        view_submenu =
            view_submenu
                .separator()
                .fullscreen_with_text(t(language, "menu.view.fullscreen", &[]));
    }
    let view_submenu = view_submenu.build()?;

    let window_submenu = if profile.window_menu {
        Some(
            SubmenuBuilder::new(app, t(language, "menu.window", &[]))
                .minimize_with_text(t(language, "menu.window.minimize", &[]))
                .maximize_with_text(t(language, "menu.window.maximize", &[]))
                .separator()
                .close_window_with_text(t(language, "menu.window.close", &[]))
                .build()?,
        )
    } else {
        None
    };

    let mut help_submenu = SubmenuBuilder::new(app, t(language, "menu.help", &[]))
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
        );
    if !profile.application_menu {
        help_submenu =
            help_submenu.about_with_text(t(language, "menu.about", &[]), Some(about_metadata()));
    }
    let help_submenu = help_submenu.build()?;

    let mut menu = MenuBuilder::new(app);
    if let Some(submenu) = &yi_submenu {
        menu = menu.item(submenu);
    }
    menu = menu.items(&[&file_submenu, &edit_submenu, &view_submenu]);
    if let Some(submenu) = &window_submenu {
        menu = menu.item(submenu);
    }
    Ok(menu.item(&help_submenu).build()?)
}
