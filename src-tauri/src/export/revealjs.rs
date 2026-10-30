//! Reveal.js bundle output and its local distribution files.
//!
//! May import: std and the export's HTTP/download seam. Upholds: every local
//! asset reference stays below `js/dist`, and the generated page lives inside a
//! folder named after the deck.

use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use super::pictures::fetch_resource;

pub(crate) const REVEALJS_CDN: &str = "https://unpkg.com/reveal.js@6.0.1";
const REVEALJS_ASSET_LIMIT: usize = 16 * 1024 * 1024;

fn cdn_override() -> &'static Mutex<Option<String>> {
    static OVERRIDE: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    OVERRIDE.get_or_init(|| Mutex::new(None))
}

fn cdn_base() -> String {
    cdn_override()
        .lock()
        .ok()
        .and_then(|value| value.clone())
        .unwrap_or_else(|| REVEALJS_CDN.to_string())
}

/// Point Reveal.js downloads at a fixture server. The harness clears this after
/// each probe; production uses the pinned upstream release above.
pub(crate) fn use_revealjs_cdn(base: Option<String>) -> Result<(), String> {
    let mut override_value = cdn_override()
        .lock()
        .map_err(|_| "Reveal.js download seam is unavailable.".to_string())?;
    *override_value = base
        .map(|base| base.trim().trim_end_matches('/').to_string())
        .filter(|base| !base.is_empty());
    Ok(())
}

/// The bundle folder and its generated page.
pub(crate) fn revealjs_output(requested: &str) -> Result<(PathBuf, PathBuf, bool), String> {
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
    fs::create_dir_all(&bundle).map_err(|error| {
        crate::i18n::now(
            "export.cannotMake",
            &[
                ("path", &bundle.display().to_string()),
                ("reason", &error.to_string()),
            ],
        )
    })?;
    let name = bundle
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "presentation".to_string());
    let page = bundle.join(format!("{name}.html"));
    Ok((bundle, page, created))
}

/// Validate one relative Reveal.js distribution path.
pub(crate) fn reveal_asset_path(reference: &str) -> Result<PathBuf, String> {
    let reference = reference.trim().trim_start_matches("./");
    let path = Path::new(reference);
    let safe = reference.starts_with("js/dist/")
        && !reference.contains('\\')
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)));
    if !safe {
        return Err(crate::i18n::now("template.badPath", &[("file", reference)]));
    }
    Ok(path.to_path_buf())
}

/// Every unique local Reveal.js distribution reference in generated HTML.
pub(crate) fn revealjs_asset_references(html: &str) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut references = Vec::new();
    for value in attribute_values(html, "href")
        .into_iter()
        .chain(attribute_values(html, "src"))
    {
        let Ok(path) = reveal_asset_path(&value) else {
            continue;
        };
        if seen.insert(path.clone()) {
            references.push(path);
        }
    }
    references
}

/// The upstream distribution URL for one page-local `js/dist/...` reference.
///
/// Pandoc's local Reveal.js URL is the output folder's `js` directory, so it writes `js/dist/...`.
/// The pinned package root, however, contains `dist/...`; the downloader must remove that local
/// `js/` prefix instead of asking the CDN for a path that does not exist.
pub(crate) fn revealjs_download_url(base: &str, reference: &str) -> Result<String, String> {
    let relative = reference
        .strip_prefix("js/")
        .ok_or_else(|| crate::i18n::now("template.badPath", &[("file", reference)]))?
        .replace('\\', "/");
    Ok(format!("{}/{relative}", base.trim_end_matches('/')))
}

/// Fetch every local Reveal.js asset referenced by the finished page.
pub(crate) async fn download_revealjs_assets(page: &Path) -> Result<(), String> {
    let html = fs::read_to_string(page).map_err(|error| {
        crate::i18n::now(
            "export.cannotRead",
            &[
                ("path", &page.display().to_string()),
                ("reason", &error.to_string()),
            ],
        )
    })?;
    let bundle = page
        .parent()
        .ok_or_else(|| crate::i18n::now("export.noTarget", &[]))?;
    let base = cdn_base();
    let mut downloads = Vec::new();
    for path in revealjs_asset_references(&html) {
        let target = bundle.join(&path);
        let relative = path.to_string_lossy().replace('\\', "/");
        let url = revealjs_download_url(&base, &relative)?;
        let bytes = fetch_resource(&url, REVEALJS_ASSET_LIMIT)
            .await
            .map_err(|error| {
                crate::i18n::now(
                    "export.revealAsset",
                    &[("url", &url), ("reason", &error)]
                )
            })?;
        downloads.push((target, bytes));
    }
    for (target, bytes) in downloads {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                crate::i18n::now(
                    "export.cannotMake",
                    &[
                        ("path", &parent.display().to_string()),
                        ("reason", &error.to_string()),
                    ],
                )
            })?;
        }
        crate::files::write_bytes_atomically(&target, &bytes).map_err(|error| {
            crate::i18n::now(
                "export.cannotWrite",
                &[
                    ("path", &target.display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        })?;
    }
    Ok(())
}

/// Copy every local picture into `images/` and rewrite its URL.
pub(crate) fn package_revealjs_media(page: &Path) -> Result<(), String> {
    super::html_media::package_local_media(page, "images")
}

fn attribute_values(html: &str, attribute: &str) -> Vec<String> {
    let mut values = Vec::new();
    let needle = format!("{attribute}=");
    for (at, _) in html.match_indices(&needle) {
        if at > 0
            && html[..at]
                .chars()
                .next_back()
                .is_some_and(|character| character.is_alphanumeric() || character == '-')
        {
            continue;
        }
        let after = html[at + needle.len()..].trim_start();
        let Some(first) = after.chars().next() else {
            continue;
        };
        let value = if first == '"' || first == '\'' {
            after[1..]
                .find(first)
                .map(|end| after[1..1 + end].to_string())
        } else {
            after
                .find(|character: char| character.is_whitespace() || character == '>')
                .map(|end| after[..end].to_string())
        };
        if let Some(value) = value.filter(|value| !value.is_empty()) {
            values.push(value);
        }
    }
    values
}
