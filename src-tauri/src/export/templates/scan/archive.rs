//! Safe reading and extraction of a template ZIP archive.
//!
//! May import: std, zip and the scan facade's file vocabulary. Upholds: archive entries cannot
//! climb out, symlinks are refused, and extracted files preserve the inspected relative layout.

use super::ScannedFile;
use super::source::{MAX_BYTES, MAX_FILES, relative};
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::Path;

/// Lists the package files carried by a ZIP source.
pub(super) fn list_files(source: &Path) -> Result<Vec<ScannedFile>, String> {
    let file = fs::File::open(source).map_err(|error| {
        crate::i18n::now(
            "template.cannotRead",
            &[("path", &source.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| {
        crate::i18n::now(
            "template.badZip",
            &[("path", &source.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    let mut files = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| {
            crate::i18n::now(
                "template.badZip",
                &[("path", &source.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        if zip_symlink(&entry) {
            return Err(crate::i18n::now(
                "template.symlink",
                &[("path", entry.name())],
            ));
        }
        if entry.is_dir() {
            continue;
        }
        let Some(name) = zip_name(entry.name())? else {
            continue;
        };
        files.push(ScannedFile {
            name,
            size: entry.size(),
        });
    }
    strip_single_root(&mut files);
    let bytes: u64 = files.iter().map(|file| file.size).sum();
    if files.len() > MAX_FILES {
        return Err(crate::i18n::now(
            "template.tooManyFiles",
            &[("count", &files.len().to_string()), ("limit", &MAX_FILES.to_string())],
        ));
    }
    if bytes > MAX_BYTES {
        return Err(crate::i18n::now(
            "template.tooLarge",
            &[("size", &bytes.to_string()), ("limit", &MAX_BYTES.to_string())],
        ));
    }
    let mut seen = HashSet::new();
    for file in &files {
        if !seen.insert(file.name.clone()) {
            return Err(crate::i18n::now("template.duplicateFile", &[("file", &file.name)]));
        }
    }
    files.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(files)
}

fn zip_symlink<R: std::io::Read>(entry: &zip::read::ZipFile<'_, R>) -> bool {
    entry
        .unix_mode()
        .is_some_and(|mode| mode & 0o170000 == 0o120000)
}

/// A zip entry's name as a package path, or `None` for a dot-entry the package leaves out.
fn zip_name(raw: &str) -> Result<Option<String>, String> {
    if raw.is_empty() || raw.starts_with('/') || raw.contains('\\') {
        return Err(crate::i18n::now("template.badPath", &[("file", raw)]));
    }
    let mut parts = Vec::new();
    for part in raw.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return Err(crate::i18n::now("template.badPath", &[("file", raw)]));
        }
        if part.starts_with('.') {
            return Ok(None);
        }
        parts.push(part);
    }
    if parts.is_empty() {
        return Ok(None);
    }
    let name = parts.join("/");
    relative(&name)?;
    Ok(Some(name))
}

fn strip_single_root(files: &mut Vec<ScannedFile>) {
    let Some(first) = files.first() else {
        return;
    };
    let root = first.name.split('/').next().unwrap_or("");
    if root.is_empty()
        || files.iter().any(|file| {
            file.name.split('/').next() != Some(root) || !file.name.contains('/')
        })
    {
        return;
    }
    for file in files.iter_mut() {
        file.name = file
            .name
            .split_once('/')
            .map(|(_, rest)| rest.to_string())
            .unwrap_or_else(|| file.name.clone());
    }
}

/// Reads one package file from a ZIP source.
pub(super) fn read_file(source: &Path, name: &str) -> Result<Vec<u8>, String> {
    let file = fs::File::open(source).map_err(|error| {
        crate::i18n::now(
            "template.cannotRead",
            &[("path", &source.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| {
        crate::i18n::now(
            "template.badZip",
            &[("path", &source.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    let mut found: Vec<ZipEntry> = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| {
            crate::i18n::now("template.badZip", &[("path", &source.display().to_string()), ("reason", &error.to_string())])
        })?;
        if zip_symlink(&entry) {
            return Err(crate::i18n::now("template.symlink", &[("path", entry.name())]));
        }
        if entry.is_dir() {
            continue;
        }
        if let Ok(Some(candidate)) = zip_name(entry.name()) {
            found.push(ZipEntry {
                name: candidate,
                index,
                size: entry.size(),
            });
        }
    }
    strip_found_root(&mut found);
    let found = found
        .into_iter()
        .find(|candidate| candidate.name == name)
        .ok_or_else(|| crate::i18n::now("template.cannotRead", &[("path", name), ("reason", "not in source")]))?;
    let mut entry = archive.by_index(found.index).map_err(|error| {
        crate::i18n::now("template.badZip", &[("path", &source.display().to_string()), ("reason", &error.to_string())])
    })?;
    let mut bytes = Vec::new();
    entry
        .by_ref()
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            crate::i18n::now(
                "template.cannotRead",
                &[("path", name), ("reason", &error.to_string())],
            )
        })?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(crate::i18n::now(
            "template.tooLarge",
            &[("size", &bytes.len().to_string()), ("limit", &MAX_BYTES.to_string())],
        ));
    }
    Ok(bytes)
}

struct ZipEntry {
    name: String,
    index: usize,
    size: u64,
}

fn strip_found_root(found: &mut [ZipEntry]) {
    let Some(first) = found.first() else {
        return;
    };
    let root = first.name.split('/').next().unwrap_or("").to_string();
    if root.is_empty()
        || found.iter().any(|entry| {
            entry.name.split('/').next() != Some(root.as_str()) || !entry.name.contains('/')
        })
    {
        return;
    }
    for entry in found.iter_mut() {
        entry.name = entry
            .name
            .split_once('/')
            .map(|(_, rest)| rest.to_string())
            .unwrap_or_else(|| entry.name.clone());
    }
}

/// Extracts a ZIP source into a package staging folder.
pub(super) fn extract(source: &Path, target: &Path) -> Result<(), String> {
    let file = fs::File::open(source).map_err(|error| {
        crate::i18n::now(
            "template.cannotRead",
            &[("path", &source.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| {
        crate::i18n::now(
            "template.badZip",
            &[("path", &source.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    let mut found: Vec<ZipEntry> = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| {
            crate::i18n::now("template.badZip", &[("path", &source.display().to_string()), ("reason", &error.to_string())])
        })?;
        if zip_symlink(&entry) {
            return Err(crate::i18n::now("template.symlink", &[("path", entry.name())]));
        }
        if entry.is_dir() {
            continue;
        }
        if let Some(name) = zip_name(entry.name())? {
            found.push(ZipEntry {
                name,
                index,
                size: entry.size(),
            });
        }
    }
    strip_found_root(&mut found);
    if found.len() > MAX_FILES {
        return Err(crate::i18n::now(
            "template.tooManyFiles",
            &[("count", &found.len().to_string()), ("limit", &MAX_FILES.to_string())],
        ));
    }
    let bytes: u64 = found.iter().map(|entry| entry.size).sum();
    if bytes > MAX_BYTES {
        return Err(crate::i18n::now(
            "template.tooLarge",
            &[("size", &bytes.to_string()), ("limit", &MAX_BYTES.to_string())],
        ));
    }
    let mut seen = HashSet::new();
    for found in found {
        if !seen.insert(found.name.clone()) {
            return Err(crate::i18n::now("template.duplicateFile", &[("file", &found.name)]));
        }
        let destination = target.join(relative(&found.name)?);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                crate::i18n::now(
                    "template.cannotMake",
                    &[("path", &parent.display().to_string()), ("reason", &error.to_string())],
                )
            })?;
        }
        let mut entry = archive.by_index(found.index).map_err(|error| {
            crate::i18n::now("template.badZip", &[("path", &source.display().to_string()), ("reason", &error.to_string())])
        })?;
        let mut written = fs::File::create(&destination).map_err(|error| {
            crate::i18n::now(
                "template.cannotWrite",
                &[("path", &destination.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        let copied = std::io::copy(&mut entry.by_ref().take(MAX_BYTES + 1), &mut written).map_err(|error| {
            crate::i18n::now(
                "template.cannotWrite",
                &[("path", &destination.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        if copied > MAX_BYTES {
            return Err(crate::i18n::now(
                "template.tooLarge",
                &[("size", &copied.to_string()), ("limit", &MAX_BYTES.to_string())],
            ));
        }
    }
    Ok(())
}
