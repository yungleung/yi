//! Turning an inspected source into a durable package, and the package's own file operations.
//!
//! The reader's file, folder or zip is copied into a hidden staging folder first; the package is
//! written there, validated, and renamed into place in one step. A failed import leaves no half
//! package, and a reader's file is never written to at all.
//!
//! May import: the manifest and scanning rules, the export folder and the app's atomic file seam.
//! Upholds: every package is complete when it appears, and no package path can leave its folder.

use serde::{Deserialize, Serialize};
#[cfg(test)]
use std::fs;
#[cfg(test)]
use std::path::PathBuf;

use super::manifest::TemplateManifest;

mod alias;
mod editor;
mod import;
mod library;
mod storage;

pub(crate) use alias::{alias_names, stage_alias};
pub use editor::{
    read_package_file as read_template_file, write_package_file as write_template_file,
};
pub use import::{
    create_default, import_template, inspect_template, update_details, wrapper_preview,
};
pub(crate) use library::resolve_package;
pub use library::{duplicate_template, list_templates, remove_template};
#[cfg(test)]
use storage::is_text_name;
#[cfg(test)]
pub(super) use storage::{
    is_reference_entry, nanos, package_files, package_path, unique_asset_name,
};

/// One file as the package editor lists it.
#[derive(Debug, Serialize, Clone)]
pub struct TemplateFileInfo {
    pub name: String,
    pub size: u64,
    /// Whether the package editor may write this file: every text file but the app's manifest.
    pub editable: bool,
}

/// One package as the window reads it. A package whose manifest is broken is still listed, with
/// the reason, so the reader can remove or repair it rather than losing it behind a silent list.
#[derive(Debug, Serialize, Clone)]
pub struct TemplateSummary {
    pub id: String,
    pub path: String,
    pub manifest: Option<TemplateManifest>,
    pub error: Option<String>,
    pub files: Vec<TemplateFileInfo>,
}

/// What the reader confirmed after inspection.
#[derive(Debug, Deserialize, Clone)]
pub struct ImportRequest {
    pub source: String,
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub entry: Option<String>,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    /// Whether the wrapper's `\title{…}` and `\author{…}` should become `$title$` and `$author$`.
    /// Both are off unless the reader ticked them.
    #[serde(default)]
    pub map_title: bool,
    #[serde(default)]
    pub map_author: bool,
}

/// What the details form changes. The id stays: the reader's saved choice points at it.
#[derive(Debug, Deserialize, Clone)]
pub struct DetailsPatch {
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub entry: Option<String>,
}

#[cfg(test)]
mod tests;
