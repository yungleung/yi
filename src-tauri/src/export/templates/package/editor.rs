//! The template code panel's file contract: editable text files, read-only binaries and atomic save.
//!
//! May import: std, the package resolver, storage classification and the atomic file seam. Upholds:
//! the app-owned manifest is never writable from the editor and no path leaves the package.

use super::library::templates_dir;
use super::storage::package_path;
use crate::export::templates::manifest::file_in;
use std::fs;

/// Reads one of a package's text files.
pub fn read_package_file(
    app: &tauri::AppHandle,
    id: String,
    file: String,
) -> Result<String, String> {
    let dir = templates_dir(app)?;
    let path = package_path(&dir, &id)?;
    let target = file_in(&path, &file)?;
    if !target.is_file() {
        return Err(crate::i18n::now(
            "template.entryMissing",
            &[("file", &file)],
        ));
    }
    fs::read_to_string(&target)
        .map_err(|error| crate::i18n::path_error("template.cannotRead", target.display(), error))
}

/// Writes one of a package's text files atomically. The app's manifest is not editable here.
pub fn write_package_file(
    app: &tauri::AppHandle,
    id: String,
    file: String,
    text: String,
) -> Result<(), String> {
    if file == "template.json" {
        return Err(crate::i18n::now("template.manifestAppOwned", &[]));
    }
    let dir = templates_dir(app)?;
    let path = package_path(&dir, &id)?;
    let target = file_in(&path, &file)?;
    if !target.is_file() {
        return Err(crate::i18n::now(
            "template.entryMissing",
            &[("file", &file)],
        ));
    }
    crate::files::write_atomically(&target, &text)
        .map_err(|error| crate::i18n::path_error("template.cannotWrite", target.display(), error))
}
