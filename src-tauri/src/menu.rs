use std::error::Error;
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{App, Emitter};
use tauri_plugin_dialog::DialogExt;

pub fn set_as_main_menu(app: &mut App) -> Result<(), Box<dyn Error>> {
    let yi_submenu = SubmenuBuilder::new(app, "Yi")
        .about_with_text(
            "About Yi",
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
        .text("settings", "Settings")
        .separator()
        .hide_with_text("Hide Yi")
        .hide_others()
        .show_all()
        .separator()
        .quit_with_text("Quit Yi")
        .build()?;

    let file_submenu = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::new("New Markdown")
                .accelerator("CmdOrCtrl+N")
                .id("new_markdown")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::new("Open...")
                .accelerator("CmdOrCtrl+O")
                .id("open_file")
                .build(app)?,
        )
        .text("open_folder", "Open Folder...")
        .separator()
        .item(
            &MenuItemBuilder::new("Save")
                .accelerator("CmdOrCtrl+S")
                .id("save")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::new("Save As...")
                .accelerator("CmdOrCtrl+Shift+S")
                .id("save_as")
                .build(app)?,
        )
        .separator()
        .text("export", "Export")
        .separator()
        .close_window()
        .build()?;

    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(
            &MenuItemBuilder::new("Find")
                .accelerator("CmdOrCtrl+F")
                .id("find")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::new("Replace")
                .accelerator("CmdOrCtrl+Shift+F")
                .id("replace")
                .build(app)?,
        )
        .build()?;

    let view_submenu = SubmenuBuilder::new(app, "View").fullscreen().build()?;

    let window_submenu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    let help_submenu = SubmenuBuilder::new(app, "Help")
        .text("documentation", "Documentation")
        .text("report_issue", "Report Issue")
        .text("check_for_updates", "Check for Updates")
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[
            &yi_submenu,
            &file_submenu,
            &edit_submenu,
            &view_submenu,
            &window_submenu,
            &help_submenu,
        ])
        .build()?;

    app.set_menu(menu)?;

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
