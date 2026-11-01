//! Reading, writing and expanding the app configuration file.
//!
//! Example: a missing file answers `AppConfig::default()`, while a readable file is migrated
//! through `as_read` before it reaches a command.
//!
//! May import: the settings model, Tauri paths and standard filesystem APIs. Upholds: one code
//! path reads config and one writes it.

use std::{fs, path::PathBuf};
use tauri::Manager;

use super::model::{as_read, AppConfig};

pub(super) fn config_path(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap()
        .join("config.json")
}

pub(super) fn load_from_disk(app_handle: &tauri::AppHandle) -> anyhow::Result<AppConfig> {
    let path = config_path(app_handle);
    match fs::read_to_string(&path) {
        Ok(text) => Ok(as_read(serde_json::from_str(&text)?)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(AppConfig::default()),
        Err(error) => Err(error.into()),
    }
}

pub(crate) fn load_config(app_handle: &tauri::AppHandle) -> AppConfig {
    let cfg = load_from_disk(app_handle).unwrap_or_default();
    crate::i18n::remember(&crate::i18n::language_for(&cfg));
    crate::access::grant_folders(app_handle, &cfg);
    cfg
}

pub(super) fn save_to_disk(app_handle: &tauri::AppHandle, cfg: &AppConfig) -> anyhow::Result<()> {
    let path = config_path(app_handle);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(cfg)?)?;
    Ok(())
}

pub(super) fn expand_tilde(path: &str, app: &tauri::AppHandle) -> PathBuf {
    match path.strip_prefix("~/") {
        Some(rest) => app
            .path()
            .home_dir()
            .map(|home| home.join(rest))
            .unwrap_or_else(|_| PathBuf::from(path)),
        None => PathBuf::from(path),
    }
}
