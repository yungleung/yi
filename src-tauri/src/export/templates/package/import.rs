//! Creating packages: staged import and Pandoc-default factories.
//!
//! May import: std, tauri, scan, manifest, library, storage and optional-text cleanup. Upholds: a
//! package appears only after complete staged construction and every mutation validates the
//! resulting entry.

use super::library::{summary_at, templates_dir};
use super::options::clean_option;
use super::storage::{
    is_reference_entry, is_text_entry, nanos, unique_asset_name, unique_entry_name,
};
use super::{ImportRequest, TemplateSummary};
use crate::export::kinds::{kind_of, KindTemplate, TemplateMode};
use crate::export::templates::manifest::{
    relative_path, today, unique_id, write_manifest, TemplateManifest, TemplateOrigin,
    MANIFEST_SCHEMA,
};
use crate::export::templates::scan;
use std::fs;
use std::path::Path;

/// Imports the confirmed source as a new package.
///
/// Example: `main.tex` plus `journal.cls` becomes one package directory containing both files and
/// `template.json`; the source folder remains unchanged.
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
        return Err(crate::i18n::now(
            "template.entryMissing",
            &[("file", &entry)],
        ));
    }
    let text_entry = is_text_entry(&entry);
    let reference_entry = is_reference_entry(&entry);
    match kind.template_mode {
        KindTemplate::None => {
            return Err(crate::i18n::now(
                "template.noTemplateKind",
                &[("kind", kind.kind)],
            ));
        }
        KindTemplate::ReferenceDoc if !reference_entry => {
            return Err(crate::i18n::now(
                "template.entryNotReference",
                &[("file", &entry)],
            ));
        }
        KindTemplate::Text if !text_entry => {
            return Err(crate::i18n::now(
                "template.entryNotText",
                &[("file", &entry)],
            ));
        }
        _ => {}
    }

    let dir = templates_dir(app)?;
    let id = unique_id(&dir, &request.name);
    let staging = dir.join(format!(".staging-{}-{}", std::process::id(), nanos()));
    let target = dir.join(&id);
    let built = build_package(
        source,
        &scan::ScannedSource {
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
        },
        &staging,
        &request,
        &id,
        &entry,
    );
    let result = built.and_then(|manifest| {
        write_manifest(&staging, &manifest)?;
        fs::rename(&staging, &target).map_err(|error| {
            crate::i18n::now(
                "template.cannotMake",
                &[
                    ("path", &target.display().to_string()),
                    ("reason", &error.to_string()),
                ],
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
                    &[
                        ("path", &kept.display().to_string()),
                        ("reason", &error.to_string()),
                    ],
                )
            })?;
            assets.push(original_name);
            entry = unique_entry_name(&assets, &scan::wrapper_entry(chosen));
            let wrapped_path = staging.join(&entry);
            crate::files::write_atomically(&wrapped_path, &wrapped).map_err(|error| {
                crate::i18n::now(
                    "template.cannotWrite",
                    &[
                        ("path", &wrapped_path.display().to_string()),
                        ("reason", &error.to_string()),
                    ],
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
        schema: MANIFEST_SCHEMA,
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
        return Err(crate::i18n::now(
            "template.noTemplateKind",
            &[("kind", kind.kind)],
        ));
    }
    let pandoc = crate::export::pandoc::find_pandoc()
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
        KindTemplate::None => {
            return Err(crate::i18n::now(
                "template.noTemplateKind",
                &[("kind", kind.kind)],
            ));
        }
    };
    let bytes = match kind.template_mode {
        KindTemplate::Text => crate::export::pandoc::run_pandoc_bytes(
            &pandoc,
            &[format!("--print-default-template={format}").into()],
            None,
        )?,
        KindTemplate::ReferenceDoc => crate::export::pandoc::run_pandoc_bytes(
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
            crate::i18n::now(
                "template.pandocDefaultName",
                &[(
                    "kind",
                    &crate::i18n::now(&format!("export.kind.{}", kind.kind), &[]),
                )],
            )
        });
    let dir = templates_dir(app)?;
    let id = unique_id(&dir, &name);
    let staging = dir.join(format!(".staging-{}-{}", std::process::id(), nanos()));
    let target = dir.join(&id);
    let built = (|| {
        fs::create_dir_all(&staging).map_err(|error| {
            crate::i18n::now(
                "template.cannotMake",
                &[
                    ("path", &staging.display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        })?;
        let entry = format!("template.{extension}");
        fs::write(staging.join(&entry), &bytes).map_err(|error| {
            crate::i18n::now(
                "template.cannotWrite",
                &[
                    ("path", &staging.join(&entry).display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        })?;
        let mode = if kind.template_mode == KindTemplate::ReferenceDoc {
            TemplateMode::ReferenceDoc
        } else {
            TemplateMode::Template
        };
        let manifest = TemplateManifest {
            schema: MANIFEST_SCHEMA,
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
                &[
                    ("path", &target.display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        })?;
        Ok(summary_at(&id, &target))
    })();
    if built.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    built
}
