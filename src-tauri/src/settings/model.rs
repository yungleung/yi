//! App configuration shape and defaults.
//!
//! Example: a current config names every field, including `theme`; a missing or unknown
//! field belongs to a stale file and is not accepted.
//!
//! May import: serde and the standard map type. Upholds: one current schema is the only shape
//! every config reader accepts.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct AppConfig {
    pub workspace: Option<String>,
    pub workspace_asked: bool,
    pub versioning: bool,
    pub versioning_workspace: Option<String>,
    pub bibliography_file: String,
    pub csl_style: String,
    pub editor_layout: String,
    pub new_file_frontmatter: Option<String>,
    pub image_folder: String,
    pub language: String,
    pub theme: String,
    pub push_unstacked_on_open: bool,
    pub export_templates: BTreeMap<String, String>,
    pub config_version: u32,
}

pub(crate) const CURRENT_CONFIG_VERSION: u32 = 2;

fn default_bibliography_file() -> String {
    "~/Documents/ZettlrNotes/zotero.json".to_string()
}

fn default_csl_style() -> String {
    "apa".to_string()
}

fn default_editor_layout() -> String {
    "page".to_string()
}

fn default_theme() -> String {
    "auto".to_string()
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
            theme: default_theme(),
            push_unstacked_on_open: false,
            export_templates: BTreeMap::new(),
            config_version: CURRENT_CONFIG_VERSION,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_current_schema_round_trips_without_fallbacks() {
        let text = serde_json::to_string(&AppConfig::default()).unwrap();
        let cfg: AppConfig = serde_json::from_str(&text).unwrap();
        assert_eq!(cfg.theme, "auto");
        assert_eq!(cfg.config_version, CURRENT_CONFIG_VERSION);
    }

    #[test]
    fn a_missing_current_field_is_refused() {
        let mut value = serde_json::to_value(AppConfig::default()).unwrap();
        value.as_object_mut().unwrap().remove("theme");
        assert!(serde_json::from_value::<AppConfig>(value).is_err());
    }

    #[test]
    fn an_unknown_stale_field_is_refused() {
        let mut value = serde_json::to_value(AppConfig::default()).unwrap();
        value
            .as_object_mut()
            .unwrap()
            .insert("legacy_setting".to_string(), serde_json::Value::Bool(true));
        assert!(serde_json::from_value::<AppConfig>(value).is_err());
    }
}
