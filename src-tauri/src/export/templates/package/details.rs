//! Updates package metadata and its entry/mode from the details form.
//!
//! Example: changing an entry from complete TeX to a `$body$` template changes
//! the manifest mode while preserving the original sample as an asset.
//!
//! May import: std, scan, manifest, storage, library and optional text cleanup.
//! Upholds: the package id stays stable and every chosen entry exists.

use super::library::{summary_at, templates_dir};
use super::options::clean_option;
use super::storage::{is_reference_entry, package_files, package_path, unique_asset_name};
use super::{DetailsPatch, TemplateSummary};
use crate::export::kinds::{kind_of, KindTemplate, TemplateMode};
use crate::export::templates::manifest::{file_in, read_manifest, write_manifest};
use crate::export::templates::scan;
use std::fs;

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
        return Err(crate::i18n::now(
            "template.entryMissing",
            &[("file", &entry)],
        ));
    }
    let reference = is_reference_entry(&entry);
    match kind.template_mode {
        KindTemplate::None => {
            return Err(crate::i18n::now(
                "template.noTemplateKind",
                &[("kind", kind.kind)],
            ));
        }
        KindTemplate::ReferenceDoc if !reference => {
            return Err(crate::i18n::now(
                "template.entryNotReference",
                &[("file", &entry)],
            ));
        }
        KindTemplate::Text if reference => {
            return Err(crate::i18n::now(
                "template.entryNotText",
                &[("file", &entry)],
            ));
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
                    &[
                        ("path", &target.display().to_string()),
                        ("reason", &error.to_string()),
                    ],
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
            name != &final_entry && name != "template.json" && Some(name) != manifest.csl.as_ref()
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
