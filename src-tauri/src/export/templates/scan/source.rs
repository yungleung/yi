//! Source-level template inspection: source type, file listing and safe path copies.
//!
//! May import: std and the scan facade's file vocabulary. Upholds: every listed or copied file is
//! regular, inside the source, and reported by a safe relative package path.

use super::ScannedFile;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

/// The most files one package may receive.
pub(crate) const MAX_FILES: usize = 2_000;
/// The most bytes one package may receive, uncompressed.
pub(crate) const MAX_BYTES: u64 = 200 * 1024 * 1024;

/// The kind of place a source is.
pub(crate) fn source_type(source: &Path) -> &'static str {
    if source.is_dir() {
        "folder"
    } else if source
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
    {
        "zip"
    } else {
        "file"
    }
}

/// Lists the files a source carries, with the paths the package would give them.
pub(crate) fn list_files(source: &Path) -> Result<Vec<ScannedFile>, String> {
    let files = if source.is_dir() {
        folder_files(source)?
    } else if source_type(source) == "zip" {
        super::zip_files(source)?
    } else {
        single_file(source)?
    };
    if files.len() > MAX_FILES {
        return Err(crate::i18n::now(
            "template.tooManyFiles",
            &[
                ("count", &files.len().to_string()),
                ("limit", &MAX_FILES.to_string()),
            ],
        ));
    }
    let bytes: u64 = files.iter().map(|file| file.size).sum();
    if bytes > MAX_BYTES {
        return Err(crate::i18n::now(
            "template.tooLarge",
            &[
                ("size", &bytes.to_string()),
                ("limit", &MAX_BYTES.to_string()),
            ],
        ));
    }
    if files.is_empty() {
        return Err(crate::i18n::now("template.noFiles", &[]));
    }
    Ok(files)
}

/// Reads a text file from the source.
pub(crate) fn read_text(source: &Path, name: &str) -> Result<String, String> {
    let bytes = read_file(source, name)?;
    String::from_utf8(bytes).map_err(|_| crate::i18n::now("template.notText", &[("file", name)]))
}

/// Reads one of the source's files.
pub(crate) fn read_file(source: &Path, name: &str) -> Result<Vec<u8>, String> {
    if source.is_dir() {
        let path = source.join(relative(name)?);
        return fs::read(&path).map_err(|error| {
            crate::i18n::now(
                "template.cannotRead",
                &[
                    ("path", &path.display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        });
    }
    if source_type(source) == "zip" {
        return super::read_zip_file(source, name);
    }
    let path = single_name(source)?;
    if name != path {
        return Err(crate::i18n::now(
            "template.cannotRead",
            &[("path", name), ("reason", "not in source")],
        ));
    }
    fs::read(source).map_err(|error| {
        crate::i18n::now(
            "template.cannotRead",
            &[
                ("path", &source.display().to_string()),
                ("reason", &error.to_string()),
            ],
        )
    })
}

/// Copies a source into the folder a package is being built in.
pub(crate) fn copy_into(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| {
        crate::i18n::now(
            "template.cannotMake",
            &[
                ("path", &target.display().to_string()),
                ("reason", &error.to_string()),
            ],
        )
    })?;
    if source_type(source) == "zip" {
        return super::extract_zip(source, target);
    }
    let files = list_files(source)?;
    for file in files {
        let destination = target.join(relative(&file.name)?);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                crate::i18n::now(
                    "template.cannotMake",
                    &[
                        ("path", &parent.display().to_string()),
                        ("reason", &error.to_string()),
                    ],
                )
            })?;
        }
        let bytes = read_file(source, &file.name)?;
        let mut written = fs::File::create(&destination).map_err(|error| {
            crate::i18n::now(
                "template.cannotWrite",
                &[
                    ("path", &destination.display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        })?;
        written.write_all(&bytes).map_err(|error| {
            crate::i18n::now(
                "template.cannotWrite",
                &[
                    ("path", &destination.display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        })?;
    }
    Ok(())
}

/// The one path rule a name from a folder or a zip has to pass.
pub(crate) fn relative(name: &str) -> Result<PathBuf, String> {
    if name.is_empty() || name.starts_with('/') || name.contains('\\') {
        return Err(crate::i18n::now("template.badPath", &[("file", name)]));
    }
    let mut path = PathBuf::new();
    for component in Path::new(name).components() {
        match component {
            Component::Normal(part) if !part.to_string_lossy().is_empty() => path.push(part),
            _ => return Err(crate::i18n::now("template.badPath", &[("file", name)])),
        }
    }
    if path.as_os_str().is_empty() {
        return Err(crate::i18n::now("template.badPath", &[("file", name)]));
    }
    Ok(path)
}

fn single_name(source: &Path) -> Result<String, String> {
    let name = source
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or_else(|| crate::i18n::now("template.noEntry", &[]))?;
    if name.starts_with('.') {
        return Err(crate::i18n::now("template.badPath", &[("file", &name)]));
    }
    Ok(name)
}

fn single_file(source: &Path) -> Result<Vec<ScannedFile>, String> {
    let metadata = fs::symlink_metadata(source).map_err(|_error| {
        crate::i18n::now(
            "template.sourceMissing",
            &[("path", &source.display().to_string())],
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(crate::i18n::now(
            "template.badPath",
            &[("file", &source.display().to_string())],
        ));
    }
    if metadata.len() > MAX_BYTES {
        return Err(crate::i18n::now(
            "template.tooLarge",
            &[
                ("size", &metadata.len().to_string()),
                ("limit", &MAX_BYTES.to_string()),
            ],
        ));
    }
    Ok(vec![ScannedFile {
        name: single_name(source)?,
        size: metadata.len(),
    }])
}

fn folder_files(root: &Path) -> Result<Vec<ScannedFile>, String> {
    let mut files = Vec::new();
    walk_folder(root, root, &mut files)?;
    files.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(files)
}

fn walk_folder(root: &Path, folder: &Path, files: &mut Vec<ScannedFile>) -> Result<(), String> {
    let entries = fs::read_dir(folder).map_err(|error| {
        crate::i18n::now(
            "template.cannotRead",
            &[
                ("path", &folder.display().to_string()),
                ("reason", &error.to_string()),
            ],
        )
    })?;
    let mut paths: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .collect();
    paths.sort();
    for path in paths {
        let name = path.strip_prefix(root).map_err(|_| {
            crate::i18n::now(
                "template.badPath",
                &[("file", &path.display().to_string())],
            )
        })?;
        if name
            .components()
            .any(|component| component.as_os_str().to_string_lossy().starts_with('.'))
        {
            continue;
        }
        let metadata = fs::symlink_metadata(&path).map_err(|error| {
            crate::i18n::now(
                "template.cannotRead",
                &[
                    ("path", &path.display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        })?;
        if metadata.file_type().is_symlink() {
            return Err(crate::i18n::now(
                "template.symlink",
                &[("path", &path.display().to_string())],
            ));
        }
        if metadata.is_dir() {
            walk_folder(root, &path, files)?;
        } else if metadata.is_file() {
            files.push(ScannedFile {
                name: package_name(name)?,
                size: metadata.len(),
            });
        }
    }
    Ok(())
}

fn package_name(path: &Path) -> Result<String, String> {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().into_owned()),
            _ => {
                return Err(crate::i18n::now(
                    "template.badPath",
                    &[("file", &path.display().to_string())],
                ))
            }
        }
    }
    let name = parts.join("/");
    relative(&name)?;
    Ok(name)
}
