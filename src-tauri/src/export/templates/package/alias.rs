//! Export-time staging of a package under the basename its relative template links expect.
//!
//! May import: std and manifest alias rules. Upholds: staging is temporary, platform-specific links
//! are safe and the stored package remains under its canonical id.

use super::storage::copy_directory;
use crate::export::templates::manifest::TemplateManifest;
use std::fs;
use std::path::Path;

/// The names a template may use for the package folder in its own relative links.
///
/// A folder package's original basename is part of the template's own URLs: the Yuki template, for
/// one, lives in a folder called `template` and links to `template/css/…`. The package is stored
/// under its id, so the export stages an alias with these names while pandoc reads it.
pub(crate) fn alias_names(manifest: &TemplateManifest) -> Vec<String> {
    let mut names = vec![manifest.id.clone()];
    if let Some(path) = manifest.origin.path.as_deref() {
        let path = Path::new(path);
        let name = match manifest.origin.source_type.as_str() {
            "folder" => path.file_name(),
            "zip" => path.file_stem(),
            _ => None,
        };
        if let Some(name) = name {
            let name = name.to_string_lossy().into_owned();
            if !name.is_empty()
                && !name.starts_with('.')
                && !name.contains(['/', '\\'])
                && !name.contains("..")
            {
                names.push(name);
            }
        }
    }
    names.sort();
    names.dedup();
    names
}

/// Stages the package under the names its template may use, in a folder that is added to pandoc's
/// resource path. A symlink is the cheap answer; a platform that cannot make one gets a copy.
pub(crate) fn stage_alias(
    package: &Path,
    manifest: &TemplateManifest,
    root: &Path,
) -> Result<Vec<String>, String> {
    fs::create_dir_all(root).map_err(|error| {
        crate::i18n::now(
            "template.cannotMake",
            &[
                ("path", &root.display().to_string()),
                ("reason", &error.to_string()),
            ],
        )
    })?;
    let names = alias_names(manifest);
    for name in &names {
        let target = root.join(name);
        if target.exists() {
            continue;
        }
        if link_directory(package, &target).is_err() {
            copy_directory(package, &target)?;
        }
    }
    Ok(names)
}

#[cfg(unix)]
fn link_directory(source: &Path, target: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(source, target)
}

#[cfg(windows)]
fn link_directory(source: &Path, target: &Path) -> std::io::Result<()> {
    std::os::windows::fs::symlink_dir(source, target)
}

#[cfg(not(any(unix, windows)))]
fn link_directory(_source: &Path, _target: &Path) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "directory links are not supported on this platform",
    ))
}
