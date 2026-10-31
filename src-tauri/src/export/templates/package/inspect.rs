//! Reads a candidate template source and previews wrapper conversion.
//!
//! Example: inspecting a folder returns its entry, kind and assets; wrapping a
//! complete TeX file inserts `$body$` before the closing document.
//!
//! May import: std and the scan rules. Upholds: preview reads the same source
//! bytes that import will copy.

use crate::export::templates::scan;
use std::path::Path;

/// Inspects a source and answers the package the reader would be making from it.
pub fn inspect_template(source: String) -> Result<scan::ScannedSource, String> {
    scan::inspect(Path::new(&source))
}

/// Previews a complete source after optional title/author mapping.
pub fn wrapper_preview(
    source: String,
    entry: String,
    map_title: bool,
    map_author: bool,
) -> Result<String, String> {
    let bytes = scan::read_file(Path::new(&source), &entry)?;
    let text = String::from_utf8(bytes)
        .map_err(|_| crate::i18n::now("template.notText", &[("file", &entry)]))?;
    let (mut wrapped, _line) =
        scan::insert_body(&text).ok_or_else(|| crate::i18n::now("template.noDocumentEnd", &[]))?;
    if map_title {
        wrapped = scan::replace_argument(&wrapped, "\\title", "$title$");
    }
    if map_author {
        wrapped = scan::replace_argument(&wrapped, "\\author", "$author$");
    }
    Ok(wrapped)
}
