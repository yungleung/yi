//! Writes the webview-generated LaTeX reference-label header into an export run.
//!
//! The webview owns the meaning of `reference-number-prefixes`; Rust only puts
//! the prepared source in the run's temporary folder so Pandoc can include it.
//!
//! May import: the filesystem and paths. Upholds: an export writes this file only
//! inside its own run folder, and the run removes that folder afterwards.

use std::fs;
use std::path::{Path, PathBuf};

/// Write one prepared header and answer the path handed to `--include-in-header`.
pub fn write_header(dir: &Path, source: &str) -> Result<PathBuf, String> {
    let path = dir.join("reference-header.tex");
    fs::write(&path, source)
        .map_err(|error| format!("could not write reference labels: {error}"))?;
    Ok(path)
}
