//! File and folder names that the workspace tree can display and mutate.
//!
//! Example: `"Draft"` becomes `"Draft.md"`, while `"../secret"` is refused
//! before any path is joined.
//!
//! May import: std paths and localized errors. Upholds: user names cannot escape
//! their parent folder, become hidden entries, or introduce non-markdown files.

use std::path::Path;

const MARKDOWN_EXTENSIONS: [&str; 3] = ["md", "markdown", "mdx"];
const NEW_FILE_EXTENSION: &str = "md";

/// Whether a name is one the tree can show at all.
pub(super) fn is_markdown(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| MARKDOWN_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

/// The name to use for a new entry, or a reason it cannot be one.
pub(super) fn entry_name(name: &str, is_file: bool) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(crate::i18n::now("files.nameEmpty", &[]));
    }
    if trimmed.contains(['/', '\\']) {
        return Err(crate::i18n::now("files.nameSeparator", &[]));
    }
    if trimmed.starts_with('.') {
        return Err(crate::i18n::now("files.nameHidden", &[]));
    }
    if !is_file {
        return Ok(trimmed.to_string());
    }
    if Path::new(trimmed).extension().is_none() {
        return Ok(format!("{trimmed}.{NEW_FILE_EXTENSION}"));
    }
    if !is_markdown(trimmed) {
        return Err(crate::i18n::now(
            "files.markdownOnly",
            &[("extension", NEW_FILE_EXTENSION)],
        ));
    }
    Ok(trimmed.to_string())
}
