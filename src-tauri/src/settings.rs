//! This module contains the settings of the application, which is shared across all components.

use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{Emitter, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
  pub workspace: Option<String>,
  /// Path to the bibliography file (CSL-JSON or BibTeX) used to format
  /// citations. Chosen by the user; a default is provided for development.
  #[serde(default = "default_bibliography_file")]
  pub bibliography_file: String,
  /// CSL style name (one of the styles bundled with citation-js, e.g. `apa`).
  #[serde(default = "default_csl_style")]
  pub csl_style: String,
  pub config_version: u32,
}

const CURRENT_CONFIG_VERSION: u32 = 1;

fn default_bibliography_file() -> String {
  "~/Documents/ZettlrNotes/zotero.json".to_string()
}

fn default_csl_style() -> String {
  "apa".to_string()
}

impl Default for AppConfig {
  fn default() -> Self {
    Self {
      workspace: None,
      bibliography_file: default_bibliography_file(),
      csl_style: default_csl_style(),
      config_version: CURRENT_CONFIG_VERSION,
    }
  }
}

fn config_path(app_handle: &tauri::AppHandle) -> PathBuf {
  // App data dir is per-app + per-user (writable).
  let dir = app_handle.path().app_data_dir().unwrap();
  dir.join("config.json")
}

fn load_from_disk(app_handle: &tauri::AppHandle) -> anyhow::Result<AppConfig> {
  let path = config_path(app_handle);

  match fs::read_to_string(&path) {
    Ok(s) => Ok(serde_json::from_str(&s)?),
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(AppConfig::default()),
    Err(err) => Err(err.into()),
  }
}

fn save_to_disk(app_handle: &tauri::AppHandle, cfg: &AppConfig) -> anyhow::Result<()> {
  let path = config_path(app_handle);

  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)?;
  }

  let s = serde_json::to_string_pretty(cfg)?;
  fs::write(path, s)?;
  Ok(())
}

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> Result<AppConfig, String> {
  load_from_disk(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_config(app: tauri::AppHandle, cfg: AppConfig) -> Result<(), String> {
  if cfg.config_version != CURRENT_CONFIG_VERSION {
    return Err(format!(
      "Config version mismatch: expected {}, got {}",
      CURRENT_CONFIG_VERSION, cfg.config_version
    ));
  }
  let previous = load_from_disk(&app).unwrap_or_default();
  save_to_disk(&app, &cfg).map_err(|e| e.to_string())
    .map(|_| {
      // Let other windows (e.g. the editor) refresh their citation formatting
      // when the bibliography file or CSL style changes.
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

/// Reads the configured bibliography file so the frontend can parse and
/// format citations. The CSL style is read separately from the app config.
#[tauri::command]
pub fn read_bibliography(app: tauri::AppHandle) -> Result<String, String> {
  let cfg = load_from_disk(&app).map_err(|e| e.to_string())?;
  let path = expand_tilde(&cfg.bibliography_file, &app);
  fs::read_to_string(&path).map_err(|e| {
    format!(
      "Failed to read bibliography file {}: {}",
      path.display(),
      e
    )
  })
}

/// Expands a leading `~` in a user-supplied path to the home directory.
fn expand_tilde(path: &str, app: &tauri::AppHandle) -> PathBuf {
  match path.strip_prefix("~/") {
    Some(rest) => app
      .path()
      .home_dir()
      .map(|home| home.join(rest))
      .unwrap_or_else(|_| PathBuf::from(path)),
    None => PathBuf::from(path),
  }
}
