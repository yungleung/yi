//! One workspace-folder read, filtered to the entries the tree displays.
//!
//! Example: a folder containing `note.md`, `photo.png`, and `.git` returns only
//! `note.md`; a nested folder is returned as a folder.
//!
//! May import: std filesystem, localized errors, and the shared name rule.
//! Upholds: listing is read-only and hidden entries never reach the tree.

use std::fs;
use std::path::PathBuf;

use super::names::is_markdown;

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
pub struct FileInfo {
    pub path: String,
    pub basename: String,
    pub is_file: bool,
}

#[tauri::command]
pub fn list_folder_files(folder_path: String) -> Result<Vec<FileInfo>, String> {
    let folder = PathBuf::from(folder_path);

    if !folder.exists() {
        return Err(crate::i18n::now(
            "files.folderMissing",
            &[("path", &folder.display().to_string())],
        ));
    }

    if !folder.is_dir() {
        return Err(crate::i18n::now(
            "files.notADirectory",
            &[("path", &folder.display().to_string())],
        ));
    }

    let mut entries = fs::read_dir(&folder)
        .map_err(|err| crate::i18n::path_error("files.readFailed", folder.display(), err))?
        .filter_map(|entry| {
            entry.ok().and_then(|entry| {
                let path = entry.path();
                let basename = entry.file_name().to_string_lossy().into_owned();

                if basename.starts_with('.') {
                    return None;
                }

                if path.is_dir() {
                    return Some(FileInfo {
                        path: path.to_string_lossy().into_owned(),
                        basename,
                        is_file: false,
                    });
                }

                is_markdown(&basename).then_some(FileInfo {
                    path: path.to_string_lossy().into_owned(),
                    basename,
                    is_file: true,
                })
            })
        })
        .collect::<Vec<_>>();

    entries.sort_by(|left, right| left.basename.cmp(&right.basename));
    Ok(entries)
}
