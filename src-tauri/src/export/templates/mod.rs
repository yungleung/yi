//! Export template packages: the manifest, the import, the editor's file calls and validation.
//!
//! A package lives under the app's export data, never in the workspace or the session. This
//! module is the command surface the window talks to; the rules are in its children.
//!
//! May import: the export folder, the kind vocabulary and the module's own children. Upholds: the
//! window names a package by id, and the backend resolves it under the app's data folder.

mod assets;
mod defaults;
mod epub_pack;
mod manifest;
mod package;
mod scan;
mod validate;

#[allow(unused_imports)]
pub use manifest::{TemplateManifest, TemplateOrigin};
#[allow(unused_imports)]
pub use package::{
    import_template, list_templates, DetailsPatch, ImportRequest, TemplateFileInfo, TemplateSummary,
};
#[allow(unused_imports)]
pub use scan::{ScannedFile, ScannedSource, TemplateKind, WrapperProposal};
pub use validate::ValidationResult;

/// The path a manifest's own relative name has inside a resolved package.
pub(super) fn manifest_file(package: &std::path::Path, name: &str) -> std::path::PathBuf {
    manifest::file_in(package, name).unwrap_or_else(|_| package.join(name))
}

pub(super) use package::resolve_package;
#[allow(unused_imports)]
pub(super) use package::{alias_names, stage_alias};
#[allow(unused_imports)]
pub(super) use assets::{media_type, reference_to, relative_url, safe_prefix};
pub(super) use defaults::{append_defaults, ensure_pdf_defaults_safe, package_defaults};
pub(super) use epub_pack::pack_epub;

#[tauri::command]
pub fn export_templates(app: tauri::AppHandle) -> Result<Vec<TemplateSummary>, String> {
    list_templates(&app)
}

#[tauri::command]
pub fn export_template_inspect(source: String) -> Result<ScannedSource, String> {
    package::inspect_template(source)
}

#[tauri::command]
pub fn export_template_wrapper_preview(
    source: String,
    entry: String,
    map_title: bool,
    map_author: bool,
) -> Result<String, String> {
    package::wrapper_preview(source, entry, map_title, map_author)
}

#[tauri::command]
pub fn export_template_import(
    app: tauri::AppHandle,
    request: ImportRequest,
) -> Result<TemplateSummary, String> {
    import_template(&app, request)
}

#[tauri::command]
pub fn export_template_create_default(
    app: tauri::AppHandle,
    kind: String,
    name: Option<String>,
    source: Option<String>,
    license: Option<String>,
) -> Result<TemplateSummary, String> {
    package::create_default(&app, kind, name, source, license)
}

#[tauri::command]
pub fn export_template_duplicate(
    app: tauri::AppHandle,
    id: String,
) -> Result<TemplateSummary, String> {
    package::duplicate_template(&app, id)
}

#[tauri::command]
pub fn export_template_remove(app: tauri::AppHandle, id: String) -> Result<(), String> {
    package::remove_template(&app, id)
}

#[tauri::command]
pub fn export_template_update(
    app: tauri::AppHandle,
    id: String,
    patch: DetailsPatch,
) -> Result<TemplateSummary, String> {
    package::update_details(&app, id, patch)
}

#[tauri::command]
pub fn export_template_read(
    app: tauri::AppHandle,
    id: String,
    file: String,
) -> Result<String, String> {
    package::read_template_file(&app, id, file)
}

#[tauri::command]
pub fn export_template_write(
    app: tauri::AppHandle,
    id: String,
    file: String,
    text: String,
) -> Result<(), String> {
    package::write_template_file(&app, id, file, text)
}

#[tauri::command]
pub fn export_template_validate(
    app: tauri::AppHandle,
    id: String,
) -> Result<ValidationResult, String> {
    validate::validate_template(&app, id)
}

#[tauri::command]
pub fn export_template_test_pdf(
    app: tauri::AppHandle,
    id: String,
) -> Result<ValidationResult, String> {
    validate::test_pdf(&app, id)
}

#[tauri::command]
pub fn export_template_takes_pdf(kind: String) -> bool {
    validate::kind_takes_pdf(&kind)
}
