//! The generated TeX header for table references.
//!
//! The window decides the visible table word, literal prefix, and portable
//! reference macro from the note's own metadata. This module owns the run-local
//! file Pandoc receives through `--include-in-header`.
//!
//! May import: the filesystem, the app's atomic writer, and its localized
//! errors. Upholds: an empty header writes no file, and a non-empty one has a
//! name private to this export run.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Write the generated table header when there is one, and answer its path.
pub(super) fn write_reference_header(
    directory: &Path,
    text: &str,
) -> Result<Option<PathBuf>, String> {
    if text.trim().is_empty() {
        return Ok(None);
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let path = directory.join(format!("reference-header-{stamp}.tex"));
    crate::files::write_atomically(&path, text).map_err(|error| {
        crate::i18n::now(
            "export.cannotWrite",
            &[
                ("path", path.to_string_lossy().as_ref()),
                ("reason", &error.to_string()),
            ],
        )
    })?;
    Ok(Some(path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn an_empty_header_writes_no_run_file() {
        let directory = std::env::temp_dir().join(format!(
            "yi-reference-header-empty-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        assert_eq!(write_reference_header(&directory, "  \n").unwrap(), None);
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 0);
        let _ = fs::remove_dir_all(&directory);
    }

    #[test]
    fn a_header_is_written_verbatim_for_the_run() {
        let directory =
            std::env::temp_dir().join(format!("yi-reference-header-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        let text = "\\providecommand{\\yiTableRef}[1]{#1}\n";
        let path = write_reference_header(&directory, text).unwrap().unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), text);
        let _ = fs::remove_dir_all(&directory);
    }
}
