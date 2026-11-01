//! Workspace file commands: listing, entry mutations, names and atomic writes.
//!
//! Example: renaming `draft.md` to `Notes` creates `Notes.md` in the same
//! folder, while moving a folder into itself is refused before touching disk.
//!
//! May import: the focused file submodules and std filesystem. Upholds: the
//! frontend sees one stable command facade while each file rule has one home.

mod atomic;
mod listing;
mod names;

pub use atomic::{write_atomically, write_bytes_atomically};

use names::entry_name;
use std::fs;
use std::path::{Path, PathBuf};

#[tauri::command]
pub fn write_text_atomically(path: String, contents: String) -> Result<(), String> {
    atomic::write_text_atomically(path, contents)
}

#[tauri::command]
pub fn list_folder_files(folder_path: String) -> Result<Vec<listing::FileInfo>, String> {
    listing::list_folder_files(folder_path)
}

/// Whether two paths name the same entry on disk (so a rename may pick either spelling).
fn is_same_entry(left: &Path, right: &Path) -> bool {
    match (fs::canonicalize(left), fs::canonicalize(right)) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

/// The path an entry has, as the tree passes it around.
fn as_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Renames an entry inside its own folder, and answers the path it now has.
#[tauri::command]
pub fn rename_entry(path: String, name: String) -> Result<String, String> {
    let source = PathBuf::from(&path);
    if !source.exists() {
        return Err(crate::i18n::now("files.nothingThere", &[("path", &path)]));
    }
    let parent = source
        .parent()
        .ok_or_else(|| crate::i18n::now("files.noParent", &[("path", &path)]))?
        .to_path_buf();
    let name = entry_name(&name, source.is_file())?;
    let target = parent.join(&name);
    if target.exists() && !is_same_entry(&source, &target) {
        return Err(crate::i18n::now("files.alreadyThere", &[("name", &name)]));
    }
    fs::rename(&source, &target)
        .map_err(|err| crate::i18n::path_error("files.renameFailed", as_path(&source), err))?;
    Ok(as_path(&target))
}

/// Writes an empty markdown file, or makes a folder, inside `parent`.
#[tauri::command]
pub fn create_entry(parent: String, name: String, is_file: bool) -> Result<String, String> {
    let folder = PathBuf::from(&parent);
    if !folder.is_dir() {
        return Err(crate::i18n::now("files.notAFolder", &[("path", &parent)]));
    }
    let name = entry_name(&name, is_file)?;
    let target = folder.join(&name);
    if target.exists() {
        return Err(crate::i18n::now("files.alreadyThere", &[("name", &name)]));
    }
    let created = if is_file {
        fs::write(&target, "").map_err(|err| {
            crate::i18n::now(
                "files.createFailed",
                &[("name", &name), ("reason", &err.to_string())],
            )
        })
    } else {
        fs::create_dir(&target).map_err(|err| {
            crate::i18n::now(
                "files.createFailed",
                &[("name", &name), ("reason", &err.to_string())],
            )
        })
    };
    created?;
    Ok(as_path(&target))
}

/// Removes a file, or a folder and everything under it.
#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(crate::i18n::now("files.nothingThere", &[("path", &path)]));
    }
    let removed = if target.is_dir() {
        fs::remove_dir_all(&target)
    } else {
        fs::remove_file(&target)
    };
    removed.map_err(|err| crate::i18n::path_error("files.deleteFailed", as_path(&target), err))
}

/// Moves an entry into another folder, keeping its name, and answers its new path.
#[tauri::command]
pub fn move_entry(path: String, target_dir: String) -> Result<String, String> {
    let source = PathBuf::from(&path);
    if !source.exists() {
        return Err(crate::i18n::now("files.nothingThere", &[("path", &path)]));
    }
    let folder = PathBuf::from(&target_dir);
    if !folder.is_dir() {
        return Err(crate::i18n::now(
            "files.notAFolder",
            &[("path", &target_dir)],
        ));
    }
    let name = source
        .file_name()
        .ok_or_else(|| crate::i18n::now("files.noName", &[("path", &path)]))?;
    let target = folder.join(name);
    if target == source || is_same_entry(&source, &target) || is_same_entry(&source, &folder) {
        return Ok(as_path(&source));
    }
    if target.exists() {
        return Err(crate::i18n::now(
            "files.alreadyInTarget",
            &[("name", &name.to_string_lossy())],
        ));
    }
    if source.is_dir() {
        let inside = fs::canonicalize(&folder)
            .ok()
            .zip(fs::canonicalize(&source).ok())
            .is_some_and(|(folder, source)| folder.starts_with(source));
        if inside {
            return Err(crate::i18n::now("files.intoItself", &[]));
        }
    }
    fs::rename(&source, &target)
        .map_err(|err| crate::i18n::path_error("files.moveFailed", as_path(&source), err))?;
    Ok(as_path(&target))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::atomic::write_text_atomically;
    use crate::files::listing::list_folder_files;
    use std::fs;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_DIRECTORY: AtomicU32 = AtomicU32::new(0);

    fn create_temp_dir() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let ordinal = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("yi-files-test-{unique}-{ordinal}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_markdown_files_and_directories() {
        let dir = create_temp_dir();
        let nested = dir.join("nested");
        fs::create_dir(&nested).unwrap();
        fs::write(dir.join("note.txt"), "hi").unwrap();
        fs::write(dir.join("readme.md"), "# hi").unwrap();

        let result = list_folder_files(dir.to_string_lossy().to_string()).unwrap();
        let names: Vec<_> = result
            .iter()
            .map(|entry| (&entry.basename, entry.is_file))
            .collect();

        assert!(names.contains(&(&"readme.md".to_string(), true)));
        assert!(names.contains(&(&"nested".to_string(), false)));
        assert!(!names.contains(&(&"note.txt".to_string(), true)));
    }

    #[test]
    fn renames_an_entry_inside_its_own_folder() {
        let dir = create_temp_dir();
        fs::write(dir.join("note.md"), "hi").unwrap();

        let renamed = rename_entry(as_path(&dir.join("note.md")), "renamed.md".into()).unwrap();

        assert_eq!(renamed, as_path(&dir.join("renamed.md")));
        assert!(dir.join("renamed.md").is_file());
        assert!(!dir.join("note.md").exists());
    }

    #[test]
    fn a_rename_that_clashes_is_refused() {
        let dir = create_temp_dir();
        fs::write(dir.join("one.md"), "1").unwrap();
        fs::write(dir.join("two.md"), "2").unwrap();

        let error = rename_entry(as_path(&dir.join("one.md")), "two.md".into()).unwrap_err();

        assert!(error.contains("already exists"), "{error}");
        assert!(dir.join("one.md").exists());
        assert_eq!(fs::read_to_string(dir.join("two.md")).unwrap(), "2");
    }

    #[test]
    fn a_name_the_tree_cannot_show_is_refused() {
        let dir = create_temp_dir();
        fs::write(dir.join("note.md"), "hi").unwrap();

        for name in ["", "   ", "a/b.md", "a\\b.md", ".hidden.md", "note.txt"] {
            let result = rename_entry(as_path(&dir.join("note.md")), name.into());
            assert!(result.is_err(), "{name} should have been refused");
        }
        assert!(dir.join("note.md").exists());
    }

    #[test]
    fn creates_a_file_with_the_extension_the_tree_shows() {
        let dir = create_temp_dir();

        let file = create_entry(as_path(&dir), "My note".into(), true).unwrap();
        let folder = create_entry(as_path(&dir), "Notes".into(), false).unwrap();

        assert_eq!(file, as_path(&dir.join("My note.md")));
        assert!(dir.join("My note.md").is_file());
        assert_eq!(fs::read_to_string(dir.join("My note.md")).unwrap(), "");
        assert!(dir.join("Notes").is_dir());
        assert_eq!(folder, as_path(&dir.join("Notes")));
        assert!(create_entry(as_path(&dir), "My note".into(), true).is_err());
    }

    #[test]
    fn a_write_replaces_the_text_and_leaves_no_temporary_behind() {
        let dir = create_temp_dir();
        let note = dir.join("note.md");
        fs::write(&note, "the first text").unwrap();

        write_text_atomically(as_path(&note), "the second text".into()).unwrap();

        assert_eq!(fs::read_to_string(&note).unwrap(), "the second text");
        assert!(!dir.join("note.md.tmp").exists(), "the temporary is gone");
        let fresh = dir.join("fresh.md");
        write_text_atomically(as_path(&fresh), "new".into()).unwrap();
        assert_eq!(fs::read_to_string(&fresh).unwrap(), "new");
    }

    #[test]
    fn deletes_a_file_and_a_folder_with_its_contents() {
        let dir = create_temp_dir();
        let folder = dir.join("notes");
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join("deep.md"), "hi").unwrap();
        fs::write(dir.join("loose.md"), "hi").unwrap();

        delete_entry(as_path(&dir.join("loose.md"))).unwrap();
        delete_entry(as_path(&folder)).unwrap();

        assert!(!dir.join("loose.md").exists());
        assert!(!folder.exists());
        assert!(
            delete_entry(as_path(&folder)).is_err(),
            "deleting nothing is an error"
        );
    }

    #[test]
    fn moves_a_file_and_a_folder_into_another_folder() {
        let dir = create_temp_dir();
        let target = dir.join("target");
        fs::create_dir(&target).unwrap();
        fs::write(dir.join("note.md"), "hi").unwrap();
        let folder = dir.join("notes");
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join("deep.md"), "hi").unwrap();

        let moved = move_entry(as_path(&dir.join("note.md")), as_path(&target)).unwrap();
        let moved_folder = move_entry(as_path(&folder), as_path(&target)).unwrap();

        assert_eq!(moved, as_path(&target.join("note.md")));
        assert_eq!(moved_folder, as_path(&target.join("notes")));
        assert!(target.join("notes/deep.md").is_file());
    }

    #[test]
    fn a_move_that_would_lose_an_entry_is_refused() {
        let dir = create_temp_dir();
        let folder = dir.join("notes");
        let inner = folder.join("inner");
        fs::create_dir_all(&inner).unwrap();
        fs::write(folder.join("note.md"), "hi").unwrap();
        fs::write(inner.join("note.md"), "hi").unwrap();

        assert_eq!(
            move_entry(as_path(&folder.join("note.md")), as_path(&folder)).unwrap(),
            as_path(&folder.join("note.md"))
        );
        assert!(move_entry(as_path(&folder), as_path(&folder)).is_ok());
        assert!(move_entry(as_path(&folder), as_path(&inner)).is_err());
        assert!(move_entry(as_path(&inner.join("note.md")), as_path(&folder)).is_err());

        assert!(folder.join("note.md").exists());
        assert!(inner.join("note.md").exists());
    }
}
