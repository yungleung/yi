//! Keeping a non-self-contained HTML page's local pictures beside the page.
//!
//! Pandoc writes an absolute file path into `<img src>`; a page moved away from
//! this machine then loses the picture. This facade keeps the existing caller
//! boundary while its children own bundle naming, URL interpretation and media
//! packaging.
//!
//! Example: exporting `/notes/note.html` creates `/notes/note/note.html`, copies
//! its local image to `/notes/note/note.assets/`, and rewrites the page to that
//! relative URL.
//!
//! May import: the shared bundle rule and this module's focused children.
//! Upholds: web URLs and data URIs remain untouched, and every copied path is a
//! recognized image.

use std::path::PathBuf;

mod media_paths;
mod package;

pub(super) use package::{package_html_media, package_local_media};

/// The bundle folder and its generated HTML page.
pub(super) fn html_output(requested: &str) -> Result<(PathBuf, PathBuf), String> {
    let output = super::bundle_output::prepare(requested, "page")?;
    Ok((output.bundle, output.page))
}
