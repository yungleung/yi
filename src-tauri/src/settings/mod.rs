//! Settings command façade over the config model and store.
//!
//! Example: `get_config` reads and migrates one file; `set_config` validates its version, grants
//! folder access and announces config-dependent facts.
//!
//! May import: the model/store children, i18n and Tauri app access. Upholds: the frontend sees the
//! same command paths while schema and persistence remain private implementation.

mod model;
mod store;

use std::fs;
use tauri::Emitter;

pub(crate) use model::{AppConfig, CURRENT_CONFIG_VERSION};
pub(crate) use store::load_config;

use store::{expand_tilde, load_from_disk, save_to_disk};

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> Result<AppConfig, String> {
    load_from_disk(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_config(app: tauri::AppHandle, cfg: AppConfig) -> Result<(), String> {
    if cfg.config_version != CURRENT_CONFIG_VERSION {
        return Err(crate::i18n::now(
            "settings.versionMismatch",
            &[
                ("expected", &CURRENT_CONFIG_VERSION.to_string()),
                ("got", &cfg.config_version.to_string()),
            ],
        ));
    }
    crate::i18n::remember(&crate::i18n::language_for(&cfg));
    let previous = load_from_disk(&app).unwrap_or_default();
    crate::access::grant_folders(&app, &cfg);
    save_to_disk(&app, &cfg)
        .map_err(|error| error.to_string())
        .map(|_| {
            let _ = app.emit("config_changed", ());
            if previous.language != cfg.language {
                if let Err(error) = crate::menu::set_menu_for_language(&app) {
                    eprintln!("Failed to rebuild the menu: {error}");
                }
            }
            if previous.bibliography_file != cfg.bibliography_file
                || previous.csl_style != cfg.csl_style
            {
                let _ = app.emit("citation_config_changed", ());
            }
        })
}

#[tauri::command]
pub fn get_current_config_version() -> Result<u32, String> {
    Ok(CURRENT_CONFIG_VERSION)
}

#[tauri::command]
pub fn read_bibliography(app: tauri::AppHandle) -> Result<String, String> {
    let cfg = load_from_disk(&app).map_err(|error| error.to_string())?;
    let path = expand_tilde(&cfg.bibliography_file, &app);
    fs::read_to_string(&path)
        .map_err(|error| crate::i18n::path_error("bibliography.readFailed", path.display(), error))
}
