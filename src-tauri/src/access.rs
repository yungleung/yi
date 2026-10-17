//! The folders the webview may read, write and watch.
//!
//! Two of the app's own seams start scoped to the home folder — the file plugin, and the asset
//! protocol that *serves* a rendered image (`capabilities/default.json`, `tauri.conf.json`) — and that
//! is a scope about the app's files rather than the reader's: a workspace outside the home folder can be
//! listed, rearranged and deleted by the app's own commands, which carry no scope, while a click on one
//! of its notes cannot open it and *Save* cannot write it. Measured: reading
//! `/private/tmp/yi-fs-scope/note.md` from the page is refused (*"forbidden path: … maybe it is not
//! allowed on the scope for `allow-read-text-file`"*), and an image there neither saves nor paints. Not
//! a limitation the app means to have, so the folders it is *working in* are granted at run time: the
//! workspace the reader opened and the folder their pictures go in come from the config ([`folders_in`],
//! which is pure so that it can be read and tested without an app), and a document that brings its own
//! path — a restored session, a note opened from somewhere else — is granted by the window asking
//! ([`grant_folder`]), because only it knows which document it is about to read or write.
//!
//! May call: the file plugin's scope and the asset protocol's, both Tauri's own (`allow_directory`).
//! Upholds: one rule for what is granted — a reader's answer, never a guess — and every grant is a
//! *folder* that is there, because a folder is what the app works in.

use std::path::{Path, PathBuf};

use tauri::{Manager, Runtime};
use tauri_plugin_fs::FsExt;

use crate::settings::AppConfig;

/// The folder a path *names*, when it is there: the path itself for a folder, the one it sits in for a
/// file, and nothing for a path that is neither — a folder the reader has moved away from, a bare name.
/// A config's own rule: what the app is working in is a folder that exists.
fn folder_named(path: &str) -> Option<PathBuf> {
    let path = Path::new(path.trim());
    let folder = if path.is_dir() {
        path.to_path_buf()
    } else if path.is_file() {
        path.parent()?.to_path_buf()
    } else {
        return None;
    };
    (!folder.as_os_str().is_empty() && folder.exists()).then_some(folder)
}

/// The folder a path *lives in*, whether or not the file itself is there yet: a document names where it
/// belongs, and a note a session restored may have to be written back into existence — so its folder is
/// granted even when the note is not there to read.
fn folder_holding(path: &str) -> Option<PathBuf> {
    let path = Path::new(path.trim());
    let folder = if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent()?.to_path_buf()
    };
    (!folder.as_os_str().is_empty() && folder.exists()).then_some(folder)
}

/// The folders a config puts the app to work in: the workspace the reader opened, the folder the
/// settings say pictures go in when they name one, and the folder the bibliography is read from — all
/// three of them seams the *webview* reaches through its own plugins (a note's text, an inserted
/// picture, the library watched for changes).
///
/// Deduplicated, and a path that is not on disk is dropped: a config is a file the reader may have
/// moved out from under the app, and a scope entry for a folder that is not there is a grant for
/// nobody. A folder is granted recursively — a note, a picture and a new note are all inside one.
pub fn folders_in(config: &AppConfig) -> Vec<PathBuf> {
    let mut folders: Vec<PathBuf> = Vec::new();
    for named in [
        config.workspace.as_deref(),
        Some(config.image_folder.as_str()),
        Some(config.bibliography_file.as_str()),
    ]
    .into_iter()
    .flatten()
    {
        if let Some(folder) = folder_named(named) {
            if !folders.contains(&folder) {
                folders.push(folder);
            }
        }
    }
    folders
}

/// Grants one folder to both scopes — the file plugin's, and the asset protocol's — and says whether
/// it was granted. A scope that refuses a path is answered rather than swallowed, because a grant
/// this app cannot make is a note the reader cannot save.
pub fn grant<R: Runtime>(app: &tauri::AppHandle<R>, folder: &Path) -> bool {
    let files = app.fs_scope().allow_directory(folder, true).is_ok();
    let pictures = app.asset_protocol_scope().allow_directory(folder, true).is_ok();
    files && pictures
}

/// Grants every folder a config names, and answers with the ones that were granted.
pub fn grant_folders<R: Runtime>(app: &tauri::AppHandle<R>, config: &AppConfig) -> Vec<PathBuf> {
    folders_in(config)
        .into_iter()
        .filter(|folder| grant(app, folder))
        .collect()
}

/// Grants the folder of one *document's* own path, for the paths a document brings with it rather than
/// the ones a config names: a session restores documents by path, and a note may sit outside the
/// workspace — in a folder the reader has since moved on from, or one a session remembers.
///
/// The window asks before it reads or writes, because it is the side that knows which document it is
/// about to touch. A path that is not on disk is not an error: a restored note whose folder is gone is
/// a note that is gone, and the read that follows reports *that* rather than this.
#[tauri::command]
pub fn grant_folder<R: Runtime>(app: tauri::AppHandle<R>, path: String) -> Result<(), String> {
    if let Some(folder) = folder_holding(&path) {
        grant(&app, &folder);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A folder of this test's own, made and taken away again.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yi-access-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// The folders the app is put to work in, and nothing else: the workspace, the pictures folder and
    /// the library's folder, each of them once — a config naming one folder twice grants it once, and a
    /// folder that is not there is granted not at all.
    #[test]
    fn a_config_grants_the_workspace_and_the_pictures_folder_once_each() {
        let dir = scratch("folders");
        let workspace = dir.join("notes");
        let pictures = dir.join("shots");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&pictures).unwrap();

        let config = AppConfig {
            workspace: Some(workspace.to_string_lossy().into_owned()),
            image_folder: pictures.to_string_lossy().into_owned(),
            bibliography_file: String::new(),
            ..AppConfig::default()
        };
        assert_eq!(folders_in(&config), vec![workspace.clone(), pictures.clone()]);

        // The library is read (and watched) from the page too, so its folder is one the app works in —
        // and a library inside the workspace is the same grant, not a second one.
        let library = AppConfig {
            bibliography_file: workspace.join("library.bib").to_string_lossy().into_owned(),
            ..config.clone()
        };
        assert_eq!(folders_in(&library), vec![workspace.clone(), pictures.clone()]);

        // The same folder twice is one grant, and a folder that is not there is none at all.
        let same = AppConfig {
            image_folder: workspace.to_string_lossy().into_owned(),
            bibliography_file: String::new(),
            ..config
        };
        assert_eq!(folders_in(&same), vec![workspace.clone()]);
        let gone = AppConfig {
            workspace: Some(dir.join("nowhere").to_string_lossy().into_owned()),
            image_folder: String::new(),
            bibliography_file: String::new(),
            ..AppConfig::default()
        };
        assert!(folders_in(&gone).is_empty());

        // A *file* named where a folder is asked for grants the folder it sits in.
        let note = workspace.join("note.md");
        fs::write(&note, "# a note\n").unwrap();
        let file = AppConfig {
            workspace: Some(note.to_string_lossy().into_owned()),
            image_folder: String::new(),
            bibliography_file: String::new(),
            ..AppConfig::default()
        };
        assert_eq!(folders_in(&file), vec![workspace.clone()]);
        let _ = fs::remove_dir_all(&dir);
    }
}
