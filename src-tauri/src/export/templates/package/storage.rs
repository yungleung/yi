//! Shared package filesystem rules: safe ids, unique names, entry classification and copying.
//!
//! May import: std, manifest rules and editor file metadata. Upholds: package paths stay directly
//! below the template directory and no generated name overwrites an existing asset.

use super::TemplateFileInfo;
use std::fs;
use std::path::{Path, PathBuf};

pub(crate) fn package_files(path: &Path) -> Vec<TemplateFileInfo> {
    let mut files = Vec::new();
    collect_files(path, path, &mut files);
    files.sort_by(|left, right| left.name.cmp(&right.name));
    files
}

fn collect_files(root: &Path, folder: &Path, files: &mut Vec<TemplateFileInfo>) {
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            collect_files(root, &path, files);
        } else if let Ok(metadata) = fs::symlink_metadata(&path) {
            if !metadata.is_file() {
                continue;
            }
            let relative = path
                .strip_prefix(root)
                .map(|path| path.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|_| name.clone());
            files.push(TemplateFileInfo {
                editable: relative != "template.json"
                    && !is_reference_entry(&relative)
                    && is_text_name(&relative),
                name: relative,
                size: metadata.len(),
            });
        }
    }
}

pub(crate) fn package_path(dir: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty()
        || id.starts_with('.')
        || id.contains(['/', '\\'])
        || !id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(crate::i18n::now("template.badId", &[("id", id)]));
    }
    let path = dir.join(id);
    if !path.is_dir() {
        return Err(crate::i18n::now("template.notFound", &[("id", id)]));
    }
    Ok(path)
}

pub(crate) fn unique_asset_name(assets: &[String], wanted: &str) -> String {
    if !assets.iter().any(|asset| asset == wanted) {
        return wanted.to_string();
    }
    let stem = Path::new(wanted)
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| "source".to_string());
    let extension = Path::new(wanted)
        .extension()
        .map(|extension| extension.to_string_lossy().into_owned())
        .unwrap_or_else(|| "tex".to_string());
    let parent = Path::new(wanted)
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty());
    let mut number = 2;
    loop {
        let file = format!("{stem}-{number}.{extension}");
        let candidate = parent
            .map(|parent| parent.join(&file).to_string_lossy().replace('\\', "/"))
            .unwrap_or(file);
        if !assets.iter().any(|asset| asset == &candidate) {
            return candidate;
        }
        number += 1;
    }
}

pub(crate) fn unique_entry_name(assets: &[String], wanted: &str) -> String {
    unique_asset_name(assets, wanted)
}

pub(crate) fn is_text_entry(name: &str) -> bool {
    ["tex", "html", "htm", "xhtml", "txt"]
        .iter()
        .any(|extension| extension_of(name) == *extension)
}

pub(crate) fn is_reference_entry(name: &str) -> bool {
    matches!(extension_of(name), "docx" | "odt")
}

pub(crate) fn is_text_name(name: &str) -> bool {
    matches!(
        extension_of(name),
        "tex"
            | "cls"
            | "sty"
            | "bst"
            | "bbx"
            | "cbx"
            | "yaml"
            | "yml"
            | "csl"
            | "html"
            | "htm"
            | "xhtml"
            | "txt"
            | "md"
            | "bib"
            | "json"
            | "lua"
    )
}

fn extension_of(name: &str) -> &str {
    Path::new(name)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
}

pub(crate) fn copy_directory(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target)
        .map_err(|error| crate::i18n::path_error("template.cannotMake", target.display(), error))?;
    for entry in fs::read_dir(source)
        .map_err(|error| crate::i18n::path_error("template.cannotRead", source.display(), error))?
    {
        let entry = entry.map_err(|error| {
            crate::i18n::path_error("template.cannotRead", source.display(), error)
        })?;
        let path = entry.path();
        let destination = target.join(entry.file_name());
        if path.is_dir() {
            copy_directory(&path, &destination)?;
        } else {
            fs::copy(&path, &destination).map_err(|error| {
                crate::i18n::path_error("template.cannotWrite", destination.display(), error)
            })?;
        }
    }
    Ok(())
}

pub(crate) fn nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or(0)
}
