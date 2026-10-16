//! This module contains the settings of the application, which is shared across all components.

use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{Emitter, Manager};

use crate::i18n;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
  pub workspace: Option<String>,
  /// Whether the reader has been asked where their workspace is, and answered. `false` — the
  /// default, and what a config written before this field existed reads as — means a config with no
  /// workspace is asked exactly once, on the next start
  /// (`src/services/workspace_setup.ts: needsWorkspaceQuestion`).
  #[serde(default)]
  pub workspace_asked: bool,
  /// Whether the reader has asked the app to keep versions of this workspace with git: a version
  /// exists only when they ask for one, so nothing but their own answer turns this on. `false` — the
  /// default, and what a config written before the field reads as — means no git is ever run.
  #[serde(default)]
  pub versioning: bool,
  /// The workspace that answer was given for: a different folder is asked again, because consent
  /// belongs to a folder and not to the app.
  #[serde(default)]
  pub versioning_workspace: Option<String>,
  /// Path to the bibliography file (CSL-JSON or BibTeX) used to format
  /// citations. Chosen by the user; a default is provided for development.
  #[serde(default = "default_bibliography_file")]
  pub bibliography_file: String,
  /// CSL style name (one of the styles bundled with citation-js, e.g. `apa`).
  #[serde(default = "default_csl_style")]
  pub csl_style: String,
  /// How the editor is laid out: a page of A4 (`"page"`, the default) or the column at
  /// the width of the pane (`"auto"`). The titlebar button switches it, and it is
  /// remembered here so a reader who prefers one keeps it.
  #[serde(default = "default_editor_layout")]
  pub editor_layout: String,
  /// The frontmatter a new note opens with, as the reader wrote it — or `None` for the app's own
  /// (`src/services/new_document.ts` holds that one). `title`, `date`, `id` and `keywords` are
  /// the four keys the app guarantees: it stamps the date and the id, and fills the other two in
  /// when the template leaves them out, while every other line is kept exactly as written.
  ///
  /// It is `None` rather than a copy of the app's template so that a reader who never wrote one
  /// follows the app when the built-in changes. A build that stores its own default freezes that
  /// default into every config that saves anything else — which is what this field used to do.
  #[serde(default)]
  pub new_file_frontmatter: Option<String>,
  /// Where an image the reader saves goes. Empty — the default, and what a config written before
  /// this field existed reads as — means *beside the note*, so an untouched setting follows
  /// whatever the app does rather than freezing a folder into every config that was ever saved.
  #[serde(default)]
  pub image_folder: String,
  /// The language the app speaks, as one of `i18n::LANGUAGES`. Empty — the default, and what a
  /// config written before this field existed reads as — means *the reader's system locale*, so a
  /// first launch is in the language the rest of the machine is in.
  #[serde(default)]
  pub language: String,
  /// Whether a file being opened **pushes the document on screen into the stack** rather than
  /// asking about it. `false` — the default, and what a config written before this field existed
  /// reads as — keeps the app's own question, which is only asked when replacing the document on
  /// screen would lose something: a document whose text is what its file holds is replaced
  /// silently either way (`src/services/document_session.ts: openDecision`).
  #[serde(default)]
  pub push_unstacked_on_open: bool,
  pub config_version: u32,
}

const CURRENT_CONFIG_VERSION: u32 = 1;

fn default_bibliography_file() -> String {
  "~/Documents/ZettlrNotes/zotero.json".to_string()
}

fn default_csl_style() -> String {
  "apa".to_string()
}

fn default_editor_layout() -> String {
  "page".to_string()
}

impl Default for AppConfig {
  fn default() -> Self {
    Self {
      workspace: None,
      workspace_asked: false,
      versioning: false,
      versioning_workspace: None,
      bibliography_file: default_bibliography_file(),
      csl_style: default_csl_style(),
      editor_layout: default_editor_layout(),
      new_file_frontmatter: None,
      image_folder: String::new(),
      language: String::new(),
      push_unstacked_on_open: false,
      config_version: CURRENT_CONFIG_VERSION,
    }
  }
}

/// The frontmatter a new note opened with before `keywords` became a list.
const OLD_NEW_FILE_FRONTMATTER: &str = "title: Untitle\ndate:\nid:\nkeywords: untagged";

/// What a config read from disk means.
///
/// The one repair a config gets: a template that is word for word the built-in this build shipped
/// *before* the shape changed is read as no template at all. Nobody typed it — it is a default
/// this app used to write into every config that saved anything else — so a reader who never
/// chose a template follows the app's, instead of keeping a shape it no longer has.
fn as_read(mut cfg: AppConfig) -> AppConfig {
  if cfg.new_file_frontmatter.as_deref() == Some(OLD_NEW_FILE_FRONTMATTER) {
    cfg.new_file_frontmatter = None;
  }
  cfg
}

fn config_path(app_handle: &tauri::AppHandle) -> PathBuf {
  // App data dir is per-app + per-user (writable).
  let dir = app_handle.path().app_data_dir().unwrap();
  dir.join("config.json")
}

fn load_from_disk(app_handle: &tauri::AppHandle) -> anyhow::Result<AppConfig> {
  let path = config_path(app_handle);

  match fs::read_to_string(&path) {
    Ok(s) => Ok(as_read(serde_json::from_str(&s)?)),
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(AppConfig::default()),
    Err(err) => Err(err.into()),
  }
}

/// The config as it stands on disk, or the defaults when it cannot be read: a caller that only
/// wants to know which language to speak should not have to answer for a broken file.
pub fn load_config(app_handle: &tauri::AppHandle) -> AppConfig {
  let cfg = load_from_disk(app_handle).unwrap_or_default();
  // The one place the config is *read*, and so the one place the backend's own sentences learn what
  // language to speak (`i18n::now`): everything a command writes afterwards is in the reader's language.
  i18n::remember(&i18n::language_for(&cfg));
  cfg
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
  // And where it is *written*: a reader who changes the language hears the next sentence in it rather
  // than after a restart.
  i18n::remember(&i18n::language_for(&cfg));
  let previous = load_from_disk(&app).unwrap_or_default();
  save_to_disk(&app, &cfg).map_err(|e| e.to_string())
    .map(|_| {
      // Anything in the config may be read by the window that is open — the image folder is what
      // a rendered image is resolved against, the layout is how the page is drawn — so a change to
      // any of it is announced, and whoever reads a field it cares about reads it again.
      let _ = app.emit("config_changed", ());
      // The menu is a tree of labels, so a new language is a new menu: it is built again here,
      // where the change is known, rather than by every window that notices the config moved.
      if previous.language != cfg.language {
        if let Err(error) = crate::menu::set_menu_for_language(&app) {
          eprintln!("Failed to rebuild the menu: {error}");
        }
      }
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn a_config_that_still_holds_the_old_builtin_reads_as_no_template() {
    let cfg = AppConfig {
      new_file_frontmatter: Some(OLD_NEW_FILE_FRONTMATTER.to_string()),
      ..AppConfig::default()
    };

    assert_eq!(as_read(cfg).new_file_frontmatter, None);
  }

  #[test]
  fn and_a_template_the_reader_wrote_is_kept() {
    let mine = "title: Untitle\nauthor: me\nkeywords:\n  - untagged";
    let cfg = AppConfig {
      new_file_frontmatter: Some(mine.to_string()),
      ..AppConfig::default()
    };

    assert_eq!(as_read(cfg).new_file_frontmatter.as_deref(), Some(mine));
  }

  #[test]
  fn a_config_written_before_the_push_setting_reads_as_leaving_it_off() {
    // The shape a config had before the field existed: the reader has not answered, so the app's
    // own answer stands — it asks, and pushes nothing by itself.
    let json = r#"{
      "workspace": null,
      "bibliography_file": "~/Documents/ZettlrNotes/zotero.json",
      "csl_style": "apa",
      "editor_layout": "page",
      "new_file_frontmatter": null,
      "image_folder": "",
      "language": "",
      "config_version": 1
    }"#;
    let cfg: AppConfig = serde_json::from_str(json).unwrap();

    assert!(!cfg.push_unstacked_on_open);
  }

  #[test]
  fn a_config_written_before_the_workspace_question_reads_as_unasked() {
    // The shape a config had before the field existed: the reader has not been asked, and a config
    // with no workspace in it is the one the question is for.
    let json = r#"{
      "workspace": null,
      "bibliography_file": "~/Documents/ZettlrNotes/zotero.json",
      "csl_style": "apa",
      "editor_layout": "page",
      "new_file_frontmatter": null,
      "image_folder": "",
      "language": "",
      "push_unstacked_on_open": false,
      "config_version": 1
    }"#;
    let cfg: AppConfig = serde_json::from_str(json).unwrap();

    assert!(!cfg.workspace_asked);
  }

  #[test]
  fn a_config_written_before_versioning_reads_as_no_versions_and_no_workspace_for_them() {
    // The shape a config had before these fields existed: the reader has not asked for versions, so
    // nothing may run git until they do — and there is no workspace the answer belongs to.
    let json = r#"{
      "workspace": "/notes",
      "bibliography_file": "~/Documents/ZettlrNotes/zotero.json",
      "csl_style": "apa",
      "editor_layout": "page",
      "new_file_frontmatter": null,
      "image_folder": "",
      "language": "",
      "push_unstacked_on_open": false,
      "workspace_asked": true,
      "config_version": 1
    }"#;
    let cfg: AppConfig = serde_json::from_str(json).unwrap();

    assert!(!cfg.versioning);
    assert_eq!(cfg.versioning_workspace, None);
  }
}
