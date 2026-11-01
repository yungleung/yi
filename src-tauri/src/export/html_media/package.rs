//! Copying an HTML page's local images and rewriting their source attributes.
//!
//! Example: two notes reference `/tmp/a/shot.png` and `/tmp/b/shot.png`; the
//! package writes `shot.png` and `shot-2.png`, and both page references name
//! those relative files.
//!
//! May import: std collections/filesystem, the shared HTML attribute reader and
//! the local URL rules. Upholds: every copied file is an existing local image,
//! and a rewritten URL stays below the requested asset folder.

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;

use super::media_paths::{encode_url, local_image};
use crate::export::html_attributes::attribute_values;

/// Packages the local pictures referenced by one HTML page.
///
/// Example: `package_html_media("/notes/note.html")` copies its local pictures
/// to `/notes/note.assets/` and rewrites `/notes/note.html` in place.
pub(crate) fn package_html_media(output: &Path) -> Result<(), String> {
    let stem = output
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .filter(|stem| !stem.is_empty())
        .unwrap_or_else(|| "page".to_string());
    package_local_media(output, &format!("{stem}.assets"))
}

/// Copies local pictures to one relative folder and rewrites their page URLs.
///
/// Example: `package_local_media(page, "images")` turns
/// `src="/tmp/shot.png"` into `src="images/shot.png"`.
pub(crate) fn package_local_media(output: &Path, asset_folder: &str) -> Result<(), String> {
    let Ok(html) = fs::read_to_string(output) else {
        return Ok(());
    };
    let Some(folder) = output.parent() else {
        return Ok(());
    };
    let mut copied: BTreeMap<String, String> = BTreeMap::new();
    let mut used: HashSet<String> = HashSet::new();
    let mut replacements: Vec<(String, String)> = Vec::new();

    for token in image_src_values(&html) {
        let Some(source) = local_image(&token) else {
            continue;
        };
        if !source.is_file() {
            continue;
        }
        let key = source.to_string_lossy().into_owned();
        let target_name = if let Some(name) = copied.get(&key) {
            name.clone()
        } else {
            let name = unique_name(&source, &used);
            used.insert(name.clone());
            copy_media(&source, &folder.join(asset_folder).join(&name))?;
            copied.insert(key, name.clone());
            name
        };
        let relative = format!("{asset_folder}/{}", encode_url(&target_name));
        if token != relative {
            replacements.push((token, relative));
        }
    }

    if replacements.is_empty() {
        return Ok(());
    }
    let mut rewritten = html;
    for (from, to) in replacements {
        rewritten = rewritten.replace(&from, &to);
    }
    crate::files::write_atomically(output, &rewritten)
        .map_err(|error| crate::i18n::path_error("template.cannotWrite", output.display(), error))
}

/// Every picture source Pandoc may write, including Reveal.js's lazy `data-src`.
fn image_src_values(html: &str) -> Vec<String> {
    let mut values = attribute_values(html, "data-src");
    values.extend(attribute_values(html, "src"));
    values
}

/// A file name that does not overwrite a different source with the same basename.
///
/// Example: `unique_name(/tmp/b/photo.png, {photo.png})` returns
/// `photo-2.png`.
fn unique_name(source: &Path, used: &HashSet<String>) -> String {
    let name = source
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "image.png".to_string());
    if !used.contains(&name) {
        return name;
    }
    let path = Path::new(&name);
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| "image".to_string());
    let extension = path
        .extension()
        .map(|extension| format!(".{}", extension.to_string_lossy()))
        .unwrap_or_default();
    let mut number = 2;
    loop {
        let candidate = format!("{stem}-{number}{extension}");
        if !used.contains(&candidate) {
            return candidate;
        }
        number += 1;
    }
}

fn copy_media(source: &Path, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            crate::i18n::path_error("export.cannotMake", parent.display(), error)
        })?;
    }
    fs::copy(source, target)
        .map_err(|error| crate::i18n::path_error("export.cannotWrite", target.display(), error))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

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
    fn local_images_are_copied_and_web_urls_are_left_alone() {
        let dir = scratch("html-media");
        let image = dir.join("shot one.png");
        fs::write(&image, b"png").unwrap();
        let output = dir.join("note.html");
        fs::write(
            &output,
            format!(
                r#"<img src="{}"><img src="https://example.com/a.png">"#,
                image
                    .to_string_lossy()
                    .split('/')
                    .map(encode_url)
                    .collect::<Vec<_>>()
                    .join("/")
            ),
        )
        .unwrap();
        package_html_media(&output).unwrap();
        let html = fs::read_to_string(&output).unwrap();
        assert!(
            html.contains(r#"src="note.assets/shot%20one.png""#),
            "{html}"
        );
        assert!(
            html.contains(r#"src="https://example.com/a.png""#),
            "{html}"
        );
        assert_eq!(
            fs::read(dir.join("note.assets/shot one.png")).unwrap(),
            b"png"
        );
        let _ = fs::remove_dir_all(dir);
    }
}
