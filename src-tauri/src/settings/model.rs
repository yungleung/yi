//! App configuration shape, defaults and backward-compatible reads.
//!
//! Example: a pre-template config deserializes with `export_templates` empty, while the old
//! built-in new-note frontmatter is normalized to `None`.
//!
//! May import: serde and the standard map type. Upholds: config compatibility is decided here,
//! without filesystem or Tauri command concerns.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub workspace: Option<String>,
    #[serde(default)]
    pub workspace_asked: bool,
    #[serde(default)]
    pub versioning: bool,
    #[serde(default)]
    pub versioning_workspace: Option<String>,
    #[serde(default = "default_bibliography_file")]
    pub bibliography_file: String,
    #[serde(default = "default_csl_style")]
    pub csl_style: String,
    #[serde(default = "default_editor_layout")]
    pub editor_layout: String,
    #[serde(default)]
    pub new_file_frontmatter: Option<String>,
    #[serde(default)]
    pub image_folder: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub push_unstacked_on_open: bool,
    #[serde(default)]
    pub export_templates: BTreeMap<String, String>,
    pub config_version: u32,
}

pub(crate) const CURRENT_CONFIG_VERSION: u32 = 1;
const OLD_NEW_FILE_FRONTMATTER: &str = "title: Untitle\ndate:\nid:\nkeywords: untagged";

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
            export_templates: BTreeMap::new(),
            config_version: CURRENT_CONFIG_VERSION,
        }
    }
}

/// Normalize one historical built-in template to "no reader choice".
pub(super) fn as_read(mut cfg: AppConfig) -> AppConfig {
    if cfg.new_file_frontmatter.as_deref() == Some(OLD_NEW_FILE_FRONTMATTER) {
        cfg.new_file_frontmatter = None;
    }
    cfg
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
    fn a_config_written_before_template_selection_reads_as_pandocs_default() {
        let json = r#"{
      "workspace": null,
      "bibliography_file": "~/Documents/ZettlrNotes/zotero.json",
      "csl_style": "apa",
      "editor_layout": "page",
      "new_file_frontmatter": null,
      "image_folder": "",
      "language": "",
      "push_unstacked_on_open": false,
      "workspace_asked": false,
      "config_version": 1
    }"#;
        let cfg: AppConfig = serde_json::from_str(json).unwrap();
        assert!(cfg.export_templates.is_empty());
    }

    #[test]
    fn a_config_written_before_versioning_reads_as_no_versions_and_no_workspace_for_them() {
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
