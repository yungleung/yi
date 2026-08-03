//! This module contains the settings of the application, which is shared across all components.

use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
  pub workspace: Option<String>,
  pub config_version: u32,
}

const CURRENT_CONFIG_VERSION: u32 = 1;

impl Default for AppConfig {
  fn default() -> Self {
    Self {
      workspace: None,
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
  save_to_disk(&app, &cfg).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_current_config_version() -> Result<u32, String> {
  Ok(CURRENT_CONFIG_VERSION)
}
