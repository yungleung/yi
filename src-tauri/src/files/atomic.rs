//! Sibling-temporary atomic replacement for text and binary files.
//!
//! Example: replacing `note.md` writes `note.md.tmp`, syncs it, then renames it
//! over the note so no reader observes half a document.
//!
//! May import: std filesystem and localized errors. Upholds: the temporary and
//! target share a volume, and a failed write leaves the old target intact.

use std::fs;
use std::path::{Path, PathBuf};

/// Writes a file's text through one sibling-temporary rename.
///
/// Example: writing `"next"` to `/notes/a.md` first writes `/notes/a.md.tmp`, syncs it,
/// then renames it over `a.md`; a failed write leaves the old `a.md` intact.
pub fn write_atomically(path: &Path, contents: &str) -> std::io::Result<()> {
    write_bytes_atomically(path, contents.as_bytes())
}

/// Writes bytes through the same sibling-temporary rename as [`write_atomically`].
pub fn write_bytes_atomically(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    use std::io::Write;

    let mut temporary = path.as_os_str().to_os_string();
    temporary.push(".tmp");
    let temporary = PathBuf::from(temporary);
    {
        let mut file = fs::File::create(&temporary)?;
        file.write_all(contents)?;
        file.sync_all()?;
    }
    fs::rename(&temporary, path)
}

/// Saves a document's text through the app's atomic write command.
pub(super) fn write_text_atomically(path: String, contents: String) -> Result<(), String> {
    write_atomically(Path::new(&path), &contents)
        .map_err(|error| crate::i18n::path_error("files.writeFailed", &path, error))
}
