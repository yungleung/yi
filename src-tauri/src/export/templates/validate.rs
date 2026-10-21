//! Asking pandoc what it thinks of a package, on a paragraph nobody has to keep.
//!
//! Validation is a real conversion into a temp folder: the reader's defaults file, the package's
//! own defaults when it has them, its entry, CSL and resource path, and pandoc's own sentence when
//! it refuses. The PDF test is the same run with the engine turned on, and is the only one that can
//! say a `\documentclass` file is missing.
//!
//! May import: the package resolver, the export folder and the one pandoc seam. Upholds: a check
//! writes nothing outside the app's temp folder and changes nothing about the package.

use serde::Serialize;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use super::super::config::{export_dir, settings_text};
use super::super::kinds::{kind_of, KindTemplate};
use super::super::pandoc::{find_pandoc, run_pandoc};
use super::super::pandoc::run_pandoc_with_env;
use super::super::run::pdf_environment;
use super::package::resolve_package;

/// What a check found, in the reader's terms.
#[derive(Debug, Serialize, Clone)]
pub struct ValidationResult {
    pub ok: bool,
    pub message: String,
    pub warnings: Vec<String>,
}

/// Runs a one-paragraph conversion through this package.
pub fn validate_template(
    app: &tauri::AppHandle,
    id: String,
) -> Result<ValidationResult, String> {
    let (package, manifest) = resolve_package(app, &id)?;
    let entry = package.join(super::manifest::relative_path(manifest.entry())?);
    if !entry.is_file() {
        return Ok(ValidationResult {
            ok: false,
            message: crate::i18n::now(
                "template.entryMissing",
                &[("file", manifest.entry())],
            ),
            warnings: Vec::new(),
        });
    }
    let pandoc = find_pandoc()
        .0
        .ok_or_else(|| crate::i18n::now("export.noPandoc", &[]))?;
    let workspace = check_folder(app, "validate")?;
    let result = (|| {
        let note = workspace.join("fixture.md");
        fs::write(&note, "# A template check\n\nOne paragraph, one conversion.\n").map_err(|error| {
            crate::i18n::now(
                "template.cannotWrite",
                &[("path", &note.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        let defaults = workspace.join("export.yaml");
        fs::write(&defaults, settings_text(app, kind_of(&manifest.kind)?)?).map_err(|error| {
            crate::i18n::now(
                "template.cannotWrite",
                &[("path", &defaults.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        let (writer, extension) = match manifest.kind.as_str() {
            "html" => ("html5", "html"),
            "epub" => ("epub3", "epub"),
            "docx" => ("docx", "docx"),
            "odt" => ("odt", "odt"),
            _ => ("latex", "tex"),
        };
        let output = workspace.join(format!("check.{extension}"));
        let mut arguments: Vec<OsString> = vec![
            "--defaults".into(),
            defaults.into_os_string(),
        ];
        if let Some(package_defaults) = super::defaults::package_defaults(&package) {
            super::defaults::append_defaults(&mut arguments, &package_defaults);
        }
        arguments.extend([
            "--to".into(),
            writer.into(),
            "--output".into(),
            output.as_os_str().to_os_string(),
        ]);
        package_arguments(&package, &manifest, &mut arguments)?;
        arguments.push(note.as_os_str().to_os_string());
        match run_pandoc(&pandoc, &arguments, Some(&package)) {
            Ok(warnings) => Ok(ValidationResult {
                ok: true,
                message: crate::i18n::now("template.validated", &[]),
                warnings,
            }),
            Err(error) => Ok(ValidationResult {
                ok: false,
                message: error,
                warnings: Vec::new(),
            }),
        }
    })();
    let _ = fs::remove_dir_all(&workspace);
    result
}

/// The PDF test: pandoc's latex writer, the configured engine, the package as the working
/// directory, and no shell-escape flag. It is explicit because it takes seconds.
pub fn test_pdf(app: &tauri::AppHandle, id: String) -> Result<ValidationResult, String> {
    let (package, manifest) = resolve_package(app, &id)?;
    if manifest.kind != "pdf" {
        return Err(crate::i18n::now("template.pdfOnly", &[]));
    }
    let pandoc = find_pandoc()
        .0
        .ok_or_else(|| crate::i18n::now("export.noPandoc", &[]))?;
    let workspace = check_folder(app, "pdf")?;
    let result = (|| {
        let note = workspace.join("fixture.md");
        fs::write(
            &note,
            "# A template check\n\nOne paragraph, one page.\n",
        )
        .map_err(|error| {
            crate::i18n::now(
                "template.cannotWrite",
                &[("path", &note.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        let defaults = workspace.join("export.yaml");
        fs::write(&defaults, settings_text(app, kind_of(&manifest.kind)?)?).map_err(|error| {
            crate::i18n::now(
                "template.cannotWrite",
                &[("path", &defaults.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        let output = workspace.join("check.pdf");
        let mut arguments: Vec<OsString> = vec![
            "--defaults".into(),
            defaults.into_os_string(),
        ];
        if let Some(package_defaults) = super::defaults::package_defaults(&package) {
            super::defaults::ensure_pdf_defaults_safe(&package_defaults)?;
            super::defaults::append_defaults(&mut arguments, &package_defaults);
        }
        arguments.extend([
            "--output".into(),
            output.as_os_str().to_os_string(),
        ]);
        package_arguments(&package, &manifest, &mut arguments)?;
        arguments.push(note.as_os_str().to_os_string());
        let (working, environment) = pdf_environment(&package, &manifest);
        match run_pandoc_with_env(&pandoc, &arguments, working.as_deref(), &environment) {
            Ok(warnings) => Ok(ValidationResult {
                ok: true,
                message: crate::i18n::now("template.pdfValidated", &[]),
                warnings,
            }),
            Err(error) => Ok(ValidationResult {
                ok: false,
                message: error,
                warnings: Vec::new(),
            }),
        }
    })();
    let _ = fs::remove_dir_all(&workspace);
    result
}

fn package_arguments(
    package: &Path,
    manifest: &super::manifest::TemplateManifest,
    arguments: &mut Vec<OsString>,
) -> Result<(), String> {
    if manifest.mode == super::super::kinds::TemplateMode::ReferenceDoc {
        arguments.push("--reference-doc".into());
        arguments.push(
            super::manifest::file_in(package, manifest.entry())?.into_os_string(),
        );
    } else {
        arguments.push("--template".into());
        arguments.push(
            super::manifest::file_in(package, manifest.entry())?.into_os_string(),
        );
    }
    if let Some(csl) = &manifest.csl {
        arguments.push("--csl".into());
        arguments.push(super::manifest::file_in(package, csl)?.into_os_string());
    }
    arguments.push("--resource-path".into());
    arguments.push(package.as_os_str().to_os_string());
    Ok(())
}

fn check_folder(app: &tauri::AppHandle, label: &str) -> Result<PathBuf, String> {
    let folder = export_dir(app)?
        .join("tmp")
        .join(format!("template-{label}-{}-{}", std::process::id(), nanos()));
    fs::create_dir_all(&folder).map_err(|error| {
        crate::i18n::now(
            "template.cannotMake",
            &[("path", &folder.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    Ok(folder)
}

fn nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or(0)
}

/// The kinds whose package can be exercised by a PDF test; the UI asks only for these.
pub(super) fn kind_takes_pdf(kind: &str) -> bool {
    kind_of(kind)
        .map(|kind| kind.template_mode == KindTemplate::Text && kind.kind == "pdf")
        .unwrap_or(false)
}
