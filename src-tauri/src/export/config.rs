
//! Where an export's files live: the app's export folder, a kind's defaults file and CSL styles.
//!
//! The reader's copies are written once and never replaced behind their back. This module owns the
//! paths and the writes; it does not decide which kind is being exported or run pandoc.
//!
//! May import: the kind vocabulary and the app's file seam. Upholds: a file already there is left
//! exactly as it is, and a reader's edited configuration survives every export.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

use super::kinds::{config_file_name, kind_of, ExportKind};

/// A CSL style as the window can hand it over: the name it is known by, and its own text.
#[derive(Debug, serde::Deserialize, Serialize, Clone)]
pub struct CslStyle {
    pub name: String,
    pub xml: String,
}

/// Where the app keeps what the reader may edit: one folder under its own data folder.
pub(super) fn export_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|data| data.join("export"))
        .map_err(|error| crate::i18n::now("export.noDataFolder", &[("reason", &error.to_string())]))
}

/// The reader's copy of a kind's defaults file, written from the shipped one when it is not there.
///
/// The write happens **once**: a file that exists is left exactly as it is, because the point of
/// keeping it on the disk is that an edited one stays edited.
pub(super) fn ensure_defaults_in(dir: &Path, kind: &ExportKind) -> Result<PathBuf, String> {
    fs::create_dir_all(dir)
        .map_err(|error| crate::i18n::now("export.cannotMake", &[("path", &dir.display().to_string()), ("reason", &error.to_string())]))?;
    let path = dir.join(config_file_name(kind.kind));
    if !path.exists() {
        fs::write(&path, kind.defaults)
            .map_err(|error| crate::i18n::now("export.cannotWrite", &[("path", &path.display().to_string()), ("reason", &error.to_string())]))?;
    }
    Ok(path)
}

/// The name a style file may have: the style's own name when it is one, and `style` when it is not.
///
/// The name comes from a config value a reader may type anything into, and it ends up in a path, so
/// it is *filtered* rather than trusted: a name that is not made of letters, digits, dots, dashes
/// and underscores cannot name a file below the folder it is put in.
pub(super) fn style_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_')
        })
        .collect();
    if cleaned.is_empty() || cleaned.starts_with('.') {
        "style".to_string()
    } else {
        cleaned
    }
}

/// A CSL style as a file pandoc can read, under the app's export folder, and where it is.
///
/// Written when the text differs and left alone when it does not: the app hands the same style over
/// on every export, and a file rewritten each time would be one a launcher watching that folder
/// would see change for nothing.
pub(super) fn ensure_csl_in(dir: &Path, style: &CslStyle) -> Result<PathBuf, String> {
    let styles = dir.join("styles");
    fs::create_dir_all(&styles)
        .map_err(|error| crate::i18n::now("export.cannotMake", &[("path", &styles.display().to_string()), ("reason", &error.to_string())]))?;
    let path = styles.join(format!("{}.csl", style_file_name(&style.name)));
    if fs::read_to_string(&path).ok().as_deref() != Some(style.xml.as_str()) {
        fs::write(&path, &style.xml)
            .map_err(|error| crate::i18n::now("export.cannotWrite", &[("path", &path.display().to_string()), ("reason", &error.to_string())]))?;
    }
    Ok(path)
}

/// Where a run's own files live: the note written for pandoc, and the pictures fetched for it.
pub(super) fn tmp_dir(dir: &Path) -> PathBuf {
    dir.join("tmp")
}

/// Where a run's fetched pictures live. One folder, emptied when a run is over: they are that run's
/// files and nothing else's, and a note's picture is re-fetched rather than remembered, because the
/// web page it came from may have changed since.
pub(super) fn remote_dir(dir: &Path) -> PathBuf {
    tmp_dir(dir).join("remote")
}
/// A kind's defaults file, written from the shipped one when it is not there yet, and where it is.
///
/// A *read* that keeps its own promise: the file a reader is about to edit has to exist, or the
/// button that reveals it would reveal nothing. Handing the path back rather than opening it is
/// what leaves the system's hand to the window: it is revealed in the folder it lives in, or
/// opened in whatever edits text, by the granted opener plugin
/// (`ui/export/export_dialog.ts: revealConfiguration`).
pub fn export_config_path(app: tauri::AppHandle, kind: String) -> Result<String, String> {
    let kind = kind_of(&kind)?;
    if !kind.needs_pandoc {
        // A kind whose conversion is the app's own has no configuration to read — and a file made of
        // nothing would be a file a reader could edit with no effect.
        return Err(crate::i18n::now("export.noConfiguration", &[("kind", kind.kind)]));
    }
    let path = ensure_defaults_in(&export_dir(&app)?, kind)?;
    Ok(path.to_string_lossy().into_owned())
}

/// Writes the copy this build ships over the reader's own, because the reader asked for it.
///
/// The card offers the button only when the two differ ([`ExportKindInfo::config_is_shipped`]) and
/// only after the app's own question, which says what is replaced — so a copy that *is* the shipped one
/// is never offered, and a file is never changed under a reader who has not agreed to it. That is the
/// one thing a file the reader may have edited must never suffer, and why this is a command with a
/// question in front of it rather than anything the app does by itself.
pub fn export_restore_config(app: tauri::AppHandle, kind: String) -> Result<String, String> {
    let kind = kind_of(&kind)?;
    if !kind.needs_pandoc {
        return Err(crate::i18n::now("export.noConfiguration", &[("kind", kind.kind)]));
    }
    let path = export_dir(&app)?.join(config_file_name(kind.kind));
    crate::files::write_atomically(&path, kind.defaults)
        .map_err(|error| crate::i18n::now("export.cannotWrite", &[("path", &path.display().to_string()), ("reason", &error.to_string())]))?;
    Ok(path.to_string_lossy().into_owned())
}
/// The settings a kind would be run with, as their own text: the reader's copy when it has been
/// written, and the copy this build ships when it has not — what the app *would* write on the first
/// export, which is what the reader is looking at either way.
pub(super) fn settings_text(app: &tauri::AppHandle, kind: &ExportKind) -> Result<String, String> {
    let dir = export_dir(app)?;
    let path = dir.join(config_file_name(kind.kind));
    Ok(fs::read_to_string(&path).unwrap_or_else(|_| kind.defaults.to_string()))
}

