//! Turning an inspected source into a durable package, and the package's own file operations.
//!
//! The reader's file, folder or zip is copied into a hidden staging folder first; the package is
//! written there, validated, and renamed into place in one step. A failed import leaves no half
//! package, and a reader's file is never written to at all.
//!
//! May import: the manifest and scanning rules, the export folder and the app's atomic file seam.
//! Upholds: every package is complete when it appears, and no package path can leave its folder.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

use super::super::kinds::{kind_of, KindTemplate, TemplateMode};
use super::manifest::{
    file_in, read_manifest, relative_path, today, unique_id, write_manifest, TemplateManifest,
    TemplateOrigin,
};
use super::scan;

/// The subfolder of the export data that holds packages.
pub(super) fn templates_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
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

/// One file as the package editor lists it.
#[derive(Debug, Serialize, Clone)]
pub struct TemplateFileInfo {
    pub name: String,
    pub size: u64,
    /// Whether the package editor may write this file: every text file but the app's manifest.
    pub editable: bool,
}

/// One package as the window reads it. A package whose manifest is broken is still listed, with
/// the reason, so the reader can remove or repair it rather than losing it behind a silent list.
#[derive(Debug, Serialize, Clone)]
pub struct TemplateSummary {
    pub id: String,
    pub path: String,
    pub manifest: Option<TemplateManifest>,
    pub error: Option<String>,
    pub files: Vec<TemplateFileInfo>,
}

/// What the reader confirmed after inspection.
#[derive(Debug, Deserialize, Clone)]
pub struct ImportRequest {
    pub source: String,
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub entry: Option<String>,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    /// Whether the wrapper's `\title{…}` and `\author{…}` should become `$title$` and `$author$`.
    /// Both are off unless the reader ticked them.
    #[serde(default)]
    pub map_title: bool,
    #[serde(default)]
    pub map_author: bool,
}

/// What the details form changes. The id stays: the reader's saved choice points at it.
#[derive(Debug, Deserialize, Clone)]
pub struct DetailsPatch {
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub entry: Option<String>,
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

/// Inspects a source and answers the package the reader would be making from it.
pub fn inspect_template(source: String) -> Result<scan::ScannedSource, String> {
    scan::inspect(Path::new(&source))
}

/// The wrapper preview after the reader has ticked title/author mapping. Reads the source again,
/// so the preview is of the file that will be copied, not of a remembered copy.
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

/// Imports the confirmed source as a new package.
pub fn import_template(
    app: &tauri::AppHandle,
    request: ImportRequest,
) -> Result<TemplateSummary, String> {
    let source = Path::new(&request.source);
    let scanned = scan::inspect(source)?;
    if request.name.trim().is_empty() {
        return Err(crate::i18n::now("template.nameEmpty", &[]));
    }
    let kind = kind_of(&request.kind)?;
    let entry = request
        .entry
        .clone()
        .unwrap_or_else(|| scanned.entry.clone());
    if !scanned.files.iter().any(|file| file.name == entry) {
        return Err(crate::i18n::now("template.entryMissing", &[("file", &entry)]));
    }
    let text_entry = is_text_entry(&entry);
    let reference_entry = is_reference_entry(&entry);
    match kind.template_mode {
        KindTemplate::None => return Err(crate::i18n::now("template.noTemplateKind", &[("kind", kind.kind)])),
        KindTemplate::ReferenceDoc if !reference_entry => {
            return Err(crate::i18n::now("template.entryNotReference", &[("file", &entry)]))
        }
        KindTemplate::Text if !text_entry => {
            return Err(crate::i18n::now("template.entryNotText", &[("file", &entry)]))
        }
        _ => {}
    }

    let dir = templates_dir(app)?;
    let id = unique_id(&dir, &request.name);
    let staging = dir.join(format!(".staging-{}-{}", std::process::id(), nanos()));
    let target = dir.join(&id);
    let built = build_package(source, &scan::ScannedSource {
        kind: scanned.kind,
        entry: entry.clone(),
        mode: scanned.mode,
        assets: scanned.assets.clone(),
        deliver: scanned.deliver.clone(),
        warnings: scanned.warnings.clone(),
        source_type: scanned.source_type.clone(),
        suggested_kind: scanned.suggested_kind.clone(),
        csl: scanned.csl.clone(),
        entry_candidates: scanned.entry_candidates.clone(),
        ambiguous_entry: scanned.ambiguous_entry,
        wrapper: scanned.wrapper.clone(),
        files: scanned.files.clone(),
    }, &staging, &request, &id, &entry);
    let result = built.and_then(|manifest| {
        write_manifest(&staging, &manifest)?;
        fs::rename(&staging, &target).map_err(|error| {
            crate::i18n::now(
                "template.cannotMake",
                &[("path", &target.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        Ok(summary_at(&id, &target))
    });
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

fn build_package(
    source: &Path,
    scanned: &scan::ScannedSource,
    staging: &Path,
    request: &ImportRequest,
    id: &str,
    chosen: &str,
) -> Result<TemplateManifest, String> {
    scan::copy_into(source, staging)?;
    let mut entry = chosen.to_string();
    let mut assets: Vec<String> = scanned
        .files
        .iter()
        .map(|file| file.name.clone())
        .filter(|name| name != chosen && Some(name) != scanned.csl.as_ref())
        .collect();
    let text = fs::read(staging.join(relative_path(chosen)?))
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok());
    let mode = match request.kind.as_str() {
        "docx" | "odt" => TemplateMode::ReferenceDoc,
        _ => {
            let text = text.as_deref().unwrap_or("");
            if text.contains("$body$") {
                TemplateMode::Template
            } else if text.contains("\\begin{document}") && text.contains("\\end{document}") {
                TemplateMode::Wrapper
            } else {
                TemplateMode::Template
            }
        }
    };
    let (template, reference_doc) = if mode == TemplateMode::ReferenceDoc {
        (None, Some(entry.clone()))
    } else {
        if mode == TemplateMode::Wrapper {
            let (wrapped, _line) = text
                .as_deref()
                .and_then(scan::insert_body)
                .ok_or_else(|| crate::i18n::now("template.noDocumentEnd", &[]))?;
            let mut wrapped = wrapped;
            if request.map_title {
                wrapped = scan::replace_argument(&wrapped, "\\title", "$title$");
            }
            if request.map_author {
                wrapped = scan::replace_argument(&wrapped, "\\author", "$author$");
            }
            let original_name = unique_asset_name(&assets, &scan::wrapper_source(chosen));
            let original_path = staging.join(relative_path(chosen)?);
            let kept = staging.join(&original_name);
            fs::rename(&original_path, &kept).map_err(|error| {
                crate::i18n::now(
                    "template.cannotWrite",
                    &[("path", &kept.display().to_string()), ("reason", &error.to_string())],
                )
            })?;
            assets.push(original_name);
            entry = unique_entry_name(&assets, &scan::wrapper_entry(chosen));
            let wrapped_path = staging.join(&entry);
            crate::files::write_atomically(&wrapped_path, &wrapped).map_err(|error| {
                crate::i18n::now(
                    "template.cannotWrite",
                    &[("path", &wrapped_path.display().to_string()), ("reason", &error.to_string())],
                )
            })?;
        }
        (Some(entry.clone()), None)
    };
    if let Some(csl) = &scanned.csl {
        assets.push(csl.clone());
    }
    assets.sort();
    assets.dedup();
    let deliver = scan::deliver_for(Some(&request.kind), &assets);
    Ok(TemplateManifest {
        schema: super::manifest::MANIFEST_SCHEMA,
        id: id.to_string(),
        name: request.name.trim().to_string(),
        kind: request.kind.clone(),
        mode,
        origin: TemplateOrigin {
            source_type: scanned.source_type.clone(),
            path: Some(request.source.clone()),
            source: clean_option(&request.source_url),
            license: clean_option(&request.license),
            imported: Some(today()),
        },
        template,
        reference_doc,
        csl: scanned.csl.clone(),
        assets,
        deliver,
    })
}

/// Creates a package from pandoc's own default template or reference document.
pub fn create_default(
    app: &tauri::AppHandle,
    kind: String,
    name: Option<String>,
    source_url: Option<String>,
    license: Option<String>,
) -> Result<TemplateSummary, String> {
    let kind = kind_of(&kind)?;
    if !kind.needs_pandoc {
        return Err(crate::i18n::now("template.noTemplateKind", &[("kind", kind.kind)]));
    }
    let pandoc = super::super::pandoc::find_pandoc()
        .0
        .ok_or_else(|| crate::i18n::now("export.noPandoc", &[]))?;
    let (format, extension) = match kind.template_mode {
        KindTemplate::Text => (
            match kind.kind {
                "pdf" => "latex",
                "epub" => "epub3",
                other => other,
            },
            match kind.kind {
                "html" => "html",
                "epub" => "epub",
                _other => "tex",
            },
        ),
        KindTemplate::ReferenceDoc => (
            match kind.kind {
                "odt" => "reference.odt",
                _ => "reference.docx",
            },
            kind.kind,
        ),
        KindTemplate::None => return Err(crate::i18n::now("template.noTemplateKind", &[("kind", kind.kind)])),
    };
    let bytes = match kind.template_mode {
        KindTemplate::Text => super::super::pandoc::run_pandoc_bytes(
            &pandoc,
            &[
                format!("--print-default-template={format}").into(),
            ],
            None,
        )?,
        KindTemplate::ReferenceDoc => super::super::pandoc::run_pandoc_bytes(
            &pandoc,
            &[format!("--print-default-data-file={format}").into()],
            None,
        )?,
        KindTemplate::None => unreachable!(),
    };
    let name = name
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| {
            crate::i18n::now("template.pandocDefaultName", &[("kind", &crate::i18n::now(&format!("export.kind.{}", kind.kind), &[]))])
        });
    let dir = templates_dir(app)?;
    let id = unique_id(&dir, &name);
    let staging = dir.join(format!(".staging-{}-{}", std::process::id(), nanos()));
    let target = dir.join(&id);
    let built = (|| {
        fs::create_dir_all(&staging).map_err(|error| {
            crate::i18n::now(
                "template.cannotMake",
                &[("path", &staging.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        let entry = format!("template.{extension}");
        fs::write(staging.join(&entry), &bytes).map_err(|error| {
            crate::i18n::now(
                "template.cannotWrite",
                &[("path", &staging.join(&entry).display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        let mode = if kind.template_mode == KindTemplate::ReferenceDoc {
            TemplateMode::ReferenceDoc
        } else {
            TemplateMode::Template
        };
        let manifest = TemplateManifest {
            schema: super::manifest::MANIFEST_SCHEMA,
            id: id.clone(),
            name,
            kind: kind.kind.to_string(),
            mode,
            origin: TemplateOrigin {
                source_type: "pandoc-default".to_string(),
                path: Some(pandoc.display().to_string()),
                source: clean_option(&source_url),
                license: clean_option(&license),
                imported: Some(today()),
            },
            template: (mode != TemplateMode::ReferenceDoc).then(|| entry.clone()),
            reference_doc: (mode == TemplateMode::ReferenceDoc).then(|| entry.clone()),
            csl: None,
            assets: Vec::new(),
            deliver: Vec::new(),
        };
        write_manifest(&staging, &manifest)?;
        fs::rename(&staging, &target).map_err(|error| {
            crate::i18n::now(
                "template.cannotMake",
                &[("path", &target.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        Ok(summary_at(&id, &target))
    })();
    if built.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    built
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

/// Updates the manifest's own facts from the details form.
pub fn update_details(
    app: &tauri::AppHandle,
    id: String,
    patch: DetailsPatch,
) -> Result<TemplateSummary, String> {
    let dir = templates_dir(app)?;
    let path = package_path(&dir, &id)?;
    let mut manifest = read_manifest(&path)?;
    let kind = kind_of(&patch.kind)?;
    if patch.name.trim().is_empty() {
        return Err(crate::i18n::now("template.nameEmpty", &[]));
    }
    let entry = patch
        .entry
        .as_deref()
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .unwrap_or(manifest.entry())
        .to_string();
    if !file_in(&path, &entry)?.is_file() {
        return Err(crate::i18n::now("template.entryMissing", &[("file", &entry)]));
    }
    let reference = is_reference_entry(&entry);
    match kind.template_mode {
        KindTemplate::None => return Err(crate::i18n::now("template.noTemplateKind", &[("kind", kind.kind)])),
        KindTemplate::ReferenceDoc if !reference => {
            return Err(crate::i18n::now("template.entryNotReference", &[("file", &entry)]))
        }
        KindTemplate::Text if reference => {
            return Err(crate::i18n::now("template.entryNotText", &[("file", &entry)]))
        }
        _ => {}
    }
    let final_entry;
    if reference {
        manifest.mode = TemplateMode::ReferenceDoc;
        manifest.template = None;
        manifest.reference_doc = Some(entry.clone());
        final_entry = entry.clone();
    } else if manifest.mode == TemplateMode::Wrapper && entry == manifest.entry() {
        // The wrapped entry is the package's own `template.tex`: it contains `$body$`, but the mode
        // stays wrapper because the original document is still the package's source asset.
        manifest.template = Some(entry.clone());
        manifest.reference_doc = None;
        final_entry = entry.clone();
    } else {
        let text = fs::read_to_string(file_in(&path, &entry)?).unwrap_or_default();
        if text.contains("$body$") {
            manifest.mode = TemplateMode::Template;
            manifest.template = Some(entry.clone());
            manifest.reference_doc = None;
            final_entry = entry.clone();
        } else if text.contains("\\begin{document}") && text.contains("\\end{document}") {
            let (wrapped, _) = scan::insert_body(&text)
                .ok_or_else(|| crate::i18n::now("template.noDocumentEnd", &[]))?;
            // Choosing a complete sample as the entry makes it a wrapper package. The sample file
            // stays as an asset; the Pandoc entry is a new `template.tex` with escaped dollars and
            // `$body$` inserted before the closing environment.
            let wrapper = scan::wrapper_entry(&entry);
            if entry == wrapper {
                let names: Vec<String> = package_files(&path)
                    .into_iter()
                    .map(|file| file.name)
                    .collect();
                let source = unique_asset_name(&names, &scan::wrapper_source(&entry));
                fs::copy(file_in(&path, &entry)?, file_in(&path, &source)?).map_err(|error| {
                    crate::i18n::now(
                        "template.cannotWrite",
                        &[("path", &source), ("reason", &error.to_string())],
                    )
                })?;
            }
            let target = file_in(&path, &wrapper)?;
            crate::files::write_atomically(&target, &wrapped).map_err(|error| {
                crate::i18n::now(
                    "template.cannotWrite",
                    &[("path", &target.display().to_string()), ("reason", &error.to_string())],
                )
            })?;
            manifest.mode = TemplateMode::Wrapper;
            manifest.template = Some(wrapper.clone());
            manifest.reference_doc = None;
            final_entry = wrapper;
        } else {
            manifest.mode = TemplateMode::Template;
            manifest.template = Some(entry.clone());
            manifest.reference_doc = None;
            final_entry = entry.clone();
        }
    }
    manifest.name = patch.name.trim().to_string();
    manifest.kind = kind.kind.to_string();
    manifest.origin.source = clean_option(&patch.source);
    manifest.origin.license = clean_option(&patch.license);
    let files = package_files(&path);
    manifest.assets = files
        .iter()
        .map(|file| file.name.clone())
        .filter(|name| {
            name != &final_entry
                && name != "template.json"
                && Some(name) != manifest.csl.as_ref()
        })
        .collect();
    if let Some(csl) = &manifest.csl {
        manifest.assets.push(csl.clone());
    }
    manifest.assets.sort();
    manifest.assets.dedup();
    manifest.deliver = scan::deliver_for(Some(&manifest.kind), &manifest.assets);
    write_manifest(&path, &manifest)?;
    Ok(summary_at(&id, &path))
}

/// Reads one of a package's text files.
pub fn read_template_file(
    app: &tauri::AppHandle,
    id: String,
    file: String,
) -> Result<String, String> {
    let dir = templates_dir(app)?;
    let path = package_path(&dir, &id)?;
    let target = file_in(&path, &file)?;
    if !target.is_file() {
        return Err(crate::i18n::now("template.entryMissing", &[("file", &file)]));
    }
    fs::read_to_string(&target).map_err(|error| {
        crate::i18n::now(
            "template.cannotRead",
            &[("path", &target.display().to_string()), ("reason", &error.to_string())],
        )
    })
}

/// Writes one of a package's text files atomically. The app's manifest is not editable here.
pub fn write_template_file(
    app: &tauri::AppHandle,
    id: String,
    file: String,
    text: String,
) -> Result<(), String> {
    if file == "template.json" {
        return Err(crate::i18n::now("template.manifestAppOwned", &[]));
    }
    let dir = templates_dir(app)?;
    let path = package_path(&dir, &id)?;
    let target = file_in(&path, &file)?;
    if !target.is_file() {
        return Err(crate::i18n::now("template.entryMissing", &[("file", &file)]));
    }
    crate::files::write_atomically(&target, &text).map_err(|error| {
        crate::i18n::now(
            "template.cannotWrite",
            &[("path", &target.display().to_string()), ("reason", &error.to_string())],
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

pub(super) fn summary_at(id: &str, path: &Path) -> TemplateSummary {
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
            &[("path", &root.display().to_string()), ("reason", &error.to_string())],
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

fn package_files(path: &Path) -> Vec<TemplateFileInfo> {
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
                editable: relative != "template.json" && !is_reference_entry(&relative) && is_text_name(&relative),
                name: relative,
                size: metadata.len(),
            });
        }
    }
}

fn package_path(dir: &Path, id: &str) -> Result<PathBuf, String> {
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

fn unique_asset_name(assets: &[String], wanted: &str) -> String {
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
    let parent = Path::new(wanted).parent().filter(|parent| !parent.as_os_str().is_empty());
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

fn unique_entry_name(assets: &[String], wanted: &str) -> String {
    unique_asset_name(assets, wanted)
}

fn is_text_entry(name: &str) -> bool {
    ["tex", "html", "htm", "txt"].iter().any(|extension| extension_of(name) == *extension)
}

fn is_reference_entry(name: &str) -> bool {
    matches!(extension_of(name), "docx" | "odt")
}

fn is_text_name(name: &str) -> bool {
    matches!(
        extension_of(name),
        "tex" | "cls" | "sty" | "bst" | "bbx" | "cbx" | "yaml" | "yml" | "csl"
            | "html" | "htm" | "txt" | "md" | "bib" | "json" | "lua"
    )
}

fn extension_of(name: &str) -> &str {
    Path::new(name)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
}

fn clean_option(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn copy_directory(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| {
        crate::i18n::now(
            "template.cannotMake",
            &[("path", &target.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    for entry in fs::read_dir(source).map_err(|error| {
        crate::i18n::now(
            "template.cannotRead",
            &[("path", &source.display().to_string()), ("reason", &error.to_string())],
        )
    })? {
        let entry = entry.map_err(|error| crate::i18n::now("template.cannotRead", &[("path", &source.display().to_string()), ("reason", &error.to_string())]))?;
        let path = entry.path();
        let destination = target.join(entry.file_name());
        if path.is_dir() {
            copy_directory(&path, &destination)?;
        } else {
            fs::copy(&path, &destination).map_err(|error| {
                crate::i18n::now(
                    "template.cannotWrite",
                    &[("path", &destination.display().to_string()), ("reason", &error.to_string())],
                )
            })?;
        }
    }
    Ok(())
}

fn nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static NEXT: AtomicU32 = AtomicU32::new(0);

    fn temp_dir() -> PathBuf {
        let folder = std::env::temp_dir().join(format!(
            "yi-template-package-{}-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst),
            nanos()
        ));
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    #[test]
    fn a_text_name_is_the_one_the_details_form_may_edit() {
        assert!(is_text_name("main.tex"));
        assert!(is_text_name("journal.cls"));
        assert!(is_text_name("template.json"));
        assert!(!is_text_name("reference.docx"));
        assert!(is_reference_entry("reference.docx"));
    }

    #[test]
    fn an_id_with_a_separator_is_refused_before_it_is_joined() {
        let folder = temp_dir();
        assert!(package_path(&folder, "../x").is_err());
        assert!(package_path(&folder, "a/b").is_err());
        assert!(package_path(&folder, ".hidden").is_err());
        let _ = fs::remove_dir_all(folder);
    }

    #[test]
    fn a_source_asset_name_steps_aside_when_the_name_is_taken() {
        let assets = vec!["source.tex".to_string()];
        assert_eq!(unique_asset_name(&assets, "source.tex"), "source-2.tex");
        assert_eq!(unique_asset_name(&assets, "template.tex"), "template.tex");
    }

    #[test]
    fn a_package_file_list_says_which_files_are_editable() {
        let folder = temp_dir();
        fs::write(folder.join("template.json"), "{}").unwrap();
        fs::write(folder.join("main.tex"), "$body$").unwrap();
        fs::write(folder.join("reference.docx"), b"PK").unwrap();
        let files = package_files(&folder);
        assert!(files.iter().any(|file| file.name == "main.tex" && file.editable));
        assert!(files.iter().any(|file| file.name == "template.json" && !file.editable));
        assert!(files.iter().any(|file| file.name == "reference.docx" && !file.editable));
        let _ = fs::remove_dir_all(folder);
    }
}
