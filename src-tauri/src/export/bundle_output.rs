//! The folder and page paths shared by multi-file export bundles.
//!
//! Example: `/notes/talk.html` prepares `/notes/talk/` and names the page
//! `/notes/talk/talk.html`; calling it again reuses the folder and reports
//! `created: false`.
//!
//! May import: std filesystem and the app's localized path errors. Upholds: an
//! export bundle is a directory, and its page is named after that directory.

use std::fs;
use std::path::{Path, PathBuf};

/// A prepared directory for an export that owns more than one file.
pub(super) struct BundleOutput {
    pub bundle: PathBuf,
    pub page: PathBuf,
    pub created: bool,
}

/// Prepares the directory and names its entry page.
///
/// Example: `prepare("/notes/talk.html", "presentation")` drops the HTML
/// extension before making the bundle, so the result is `/notes/talk/talk.html`
/// rather than a page nested under a folder called `talk.html`.
pub(super) fn prepare(requested: &str, fallback_name: &str) -> Result<BundleOutput, String> {
    let requested = Path::new(requested);
    let extension = requested
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let bundle = if matches!(extension.as_str(), "html" | "htm") {
        requested.with_extension("")
    } else {
        requested.to_path_buf()
    };
    if bundle.as_os_str().is_empty() {
        return Err(crate::i18n::now("export.noTarget", &[]));
    }
    if bundle.exists() && !bundle.is_dir() {
        return Err(crate::i18n::now(
            "template.outputConflict",
            &[("file", &bundle.display().to_string())],
        ));
    }
    let created = !bundle.exists();
    fs::create_dir_all(&bundle)
        .map_err(|error| crate::i18n::path_error("export.cannotMake", bundle.display(), error))?;
    let name = bundle
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| fallback_name.to_string());
    let page = bundle.join(format!("{name}.html"));
    Ok(BundleOutput {
        bundle,
        page,
        created,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "yi-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn an_html_target_becomes_a_bundle_folder_with_the_page_inside() {
        let dir = scratch("html-bundle");
        let output = prepare(&dir.join("note.html").to_string_lossy(), "page").unwrap();
        assert_eq!(output.bundle, dir.join("note"));
        assert_eq!(output.page, dir.join("note").join("note.html"));
        assert!(output.created);

        let again = prepare(&dir.join("note").to_string_lossy(), "page").unwrap();
        assert_eq!(again.page, output.page);
        assert!(!again.created);
        let _ = fs::remove_dir_all(dir);
    }
}
