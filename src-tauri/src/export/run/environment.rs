//! Paths and process context for one export run.
//!
//! May import: std and the template package vocabulary. Upholds: a scratch note stays under the
//! app's export data, relative outputs resolve against the reader's source folder, and PDF runs put
//! the package and entry folders on TeX's search paths.

use crate::export::templates::TemplateManifest;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

/// Writes the note where pandoc reads files, and says where: a name of the app's own inside its
/// data folder, so nothing appears in the reader's own notes folder and no two exports collide.
pub(super) fn write_note(dir: &Path, text: &str) -> Result<PathBuf, String> {
    let scratch = dir.join("tmp");
    fs::create_dir_all(&scratch)
        .map_err(|error| crate::i18n::path_error("export.cannotMake", scratch.display(), error))?;
    let path = scratch.join(format!("note-{}-{}.md", std::process::id(), nanos()));
    fs::write(&path, text)
        .map_err(|error| crate::i18n::path_error("export.cannotWrite", path.display(), error))?;
    Ok(path)
}

pub(super) fn nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or(0)
}

/// The output path as the run means it. Pandoc is run in the package folder for a PDF, so a
/// relative destination from a caller has to become the one the reader saw.
pub(super) fn absolute_output(path: &str, source_dir: Option<&str>) -> PathBuf {
    let path = PathBuf::from(path);
    if path.is_absolute() {
        return path;
    }
    let base = source_dir
        .map(PathBuf::from)
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_default();
    base.join(path)
}

/// A PDF template entry may live in `samples/` while its class lives at the package root. Run TeX
/// from the entry's own folder so relative pictures and inputs resolve, and put both folders on the
/// TeX/BibTeX search paths so the package's class and bibliography files still resolve.
pub(crate) fn pdf_environment(
    package: &Path,
    manifest: &TemplateManifest,
) -> (Option<PathBuf>, Vec<(&'static str, OsString)>) {
    let entry = crate::export::templates::manifest_file(package, manifest.entry());
    let working = entry.parent().unwrap_or(package).to_path_buf();
    let separator = if cfg!(windows) { ';' } else { ':' };
    let mut value = format!(
        "{}{separator}{}{separator}",
        package.display(),
        working.display()
    );
    if let Ok(existing) = std::env::var("TEXINPUTS") {
        if !existing.is_empty() {
            value.push_str(&format!("{existing}{separator}"));
        }
    }
    let texinputs = OsString::from(value.clone());
    let bibinputs = OsString::from(value.clone());
    let bstinputs = OsString::from(value);
    (
        Some(working),
        vec![
            ("TEXINPUTS", texinputs),
            ("BIBINPUTS", bibinputs),
            ("BSTINPUTS", bstinputs),
        ],
    )
}
