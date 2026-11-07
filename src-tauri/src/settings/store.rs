//! Reading, writing and expanding the app configuration file.
//!
//! Example: a missing file answers `AppConfig::default()` without creating one; a stale file is
//! replaced with that current default before the command sees it.
//!
//! May import: the settings model, Tauri paths and standard filesystem APIs. Upholds: one code
//! path reads config and one writes it.

use std::{fs, path::PathBuf};
use tauri::Manager;

use super::model::{AppConfig, CURRENT_CONFIG_VERSION};

pub(super) fn config_path(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap()
        .join("config.json")
}

pub(super) fn load_from_disk(app_handle: &tauri::AppHandle) -> anyhow::Result<AppConfig> {
    load_from_path(&config_path(app_handle))
}

fn load_from_path(path: &std::path::Path) -> anyhow::Result<AppConfig> {
    match fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str::<AppConfig>(&text) {
            Ok(cfg) if cfg.config_version == CURRENT_CONFIG_VERSION => Ok(cfg),
            _ => {
                let cfg = AppConfig::default();
                save_to_path(path, &cfg)?;
                Ok(cfg)
            }
        },
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
    save_to_path(&config_path(app_handle), cfg)
}

fn save_to_path(path: &std::path::Path, cfg: &AppConfig) -> anyhow::Result<()> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_path(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("yi-settings-{name}-{}-{stamp}.json", std::process::id()))
    }

    #[test]
    fn a_missing_file_reads_the_current_default_without_writing_one() {
        let path = temporary_path("missing");
        let cfg = load_from_path(&path).unwrap();
        assert_eq!(cfg.config_version, CURRENT_CONFIG_VERSION);
        assert!(!path.exists());
    }

    #[test]
    fn a_stale_file_is_replaced_with_the_current_default() {
        let path = temporary_path("stale");
        fs::write(
            &path,
            r#"{"workspace":null,"legacy_setting":true,"config_version":1}"#,
        )
        .unwrap();
        let cfg = load_from_path(&path).unwrap();
        let written = fs::read_to_string(&path).unwrap();
        fs::remove_file(path).unwrap();
        assert_eq!(cfg.config_version, CURRENT_CONFIG_VERSION);
        assert_eq!(cfg.theme, "auto");
        assert!(!written.contains("legacy_setting"));
        let reparsed: AppConfig = serde_json::from_str(&written).unwrap();
        assert_eq!(reparsed.config_version, CURRENT_CONFIG_VERSION);
    }

    #[test]
    fn a_complete_previous_version_is_still_stale() {
        let path = temporary_path("previous-version");
        let previous = AppConfig {
            config_version: CURRENT_CONFIG_VERSION - 1,
            ..AppConfig::default()
        };
        fs::write(&path, serde_json::to_string(&previous).unwrap()).unwrap();
        let cfg = load_from_path(&path).unwrap();
        let written: AppConfig =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        fs::remove_file(path).unwrap();
        assert_eq!(cfg.config_version, CURRENT_CONFIG_VERSION);
        assert_eq!(written.config_version, CURRENT_CONFIG_VERSION);
    }
}
