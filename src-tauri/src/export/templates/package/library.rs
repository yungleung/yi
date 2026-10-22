//! Template-package discovery and lifecycle: the app's template folder, summaries and resolution.
//!
//! May import: std, tauri, manifest rules and storage helpers. Upholds: package ids resolve only
//! below the app export template directory and broken packages remain listable for removal.

use super::storage::{copy_directory, package_files, package_path};
use super::TemplateSummary;
use crate::export::templates::manifest::{
    read_manifest, today, unique_id, write_manifest, TemplateManifest, TemplateOrigin,
};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// The subfolder of the export data that holds packages.
pub(crate) fn templates_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map(|data| data.join("export").join("templates"))
        .map_err(|error| crate::i18n::now("export.noDataFolder", &[("reason", &error.to_string())]))?;
    fs::create_dir_all(&dir).map_err(|error| {
        crate::i18n::now(
            "template.cannotMake",
            &[("path", &dir.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    Ok(dir)
}

/// Lists every package, reading only what a summary needs.
pub fn list_templates(app: &tauri::AppHandle) -> Result<Vec<TemplateSummary>, String> {
    let dir = templates_dir(app)?;
    let mut packages = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|error| {
        crate::i18n::now(
            "template.cannotRead",
            &[("path", &dir.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if !path.is_dir() || name.starts_with('.') {
            continue;
        }
        packages.push(summary_at(&name, &path));
    }
    packages.sort_by(|left, right| {
        let left_name = left
            .manifest
            .as_ref()
            .map(|manifest| manifest.name.to_lowercase())
            .unwrap_or_else(|| left.id.clone());
        let right_name = right
            .manifest
            .as_ref()
            .map(|manifest| manifest.name.to_lowercase())
            .unwrap_or_else(|| right.id.clone());
        left_name.cmp(&right_name)
    });
    Ok(packages)
}

/// Copies a package under a new id and name, keeping its provenance.
pub fn duplicate_template(app: &tauri::AppHandle, id: String) -> Result<TemplateSummary, String> {
    let dir = templates_dir(app)?;
    let source = package_path(&dir, &id)?;
    let mut manifest = read_manifest(&source)?;
    let name = format!("{} copy", manifest.name);
    let new_id = unique_id(&dir, &name);
    let target = dir.join(&new_id);
    copy_directory(&source, &target)?;
    manifest.id = new_id.clone();
    manifest.name = name;
    manifest.origin = TemplateOrigin {
        source_type: "duplicate".to_string(),
        path: Some(source.display().to_string()),
        source: manifest.origin.source,
        license: manifest.origin.license,
        imported: Some(today()),
    };
    if let Err(error) = write_manifest(&target, &manifest) {
        let _ = fs::remove_dir_all(&target);
        return Err(error);
    }
    Ok(summary_at(&new_id, &target))
}

/// Removes one package and everything in it. The caller asks first.
pub fn remove_template(app: &tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = templates_dir(app)?;
    let path = package_path(&dir, &id)?;
    fs::remove_dir_all(&path).map_err(|error| {
        crate::i18n::now(
            "template.cannotDelete",
            &[("path", &path.display().to_string()), ("reason", &error.to_string())],
        )
    })
}

/// One package's folder, by id. A config value is never trusted as a path.
pub(crate) fn resolve_package(
    app: &tauri::AppHandle,
    id: &str,
) -> Result<(PathBuf, TemplateManifest), String> {
    let dir = templates_dir(app)?;
    let path = package_path(&dir, id)?;
    let manifest = read_manifest(&path)?;
    if manifest.id != id {
        return Err(crate::i18n::now("template.idMismatch", &[("id", id)]));
    }
    Ok((path, manifest))
}

pub(crate) fn summary_at(id: &str, path: &Path) -> TemplateSummary {
    match read_manifest(path) {
        Ok(manifest) => TemplateSummary {
            id: manifest.id.clone(),
            path: path.to_string_lossy().into_owned(),
            files: package_files(path),
            manifest: Some(manifest),
            error: None,
        },
        Err(error) => TemplateSummary {
            id: id.to_string(),
            path: path.to_string_lossy().into_owned(),
            files: package_files(path),
            manifest: None,
            error: Some(error),
        },
    }
}
