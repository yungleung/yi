//! The complete Pandoc command for one export, and the template package it may name.
//!
//! May import: std, the export configuration, kind vocabulary, template manifest and run request.
//! Upholds: package defaults follow the app defaults without overriding explicit output paths,
//! package arguments follow reader arguments where the package must win, and a template id resolves
//! only through the app's own package library.

use super::ExportRequest;
use super::environment::absolute_output;
use crate::export::config::ensure_csl_in;
use crate::export::kinds::{ExportKind, KindTemplate, PAPER_SIZES, TemplateMode};
use crate::export::templates::TemplateManifest;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// The whole of what the app asks pandoc for: the kind's own defaults file, the destination, the
/// folders a relative destination is resolved against, the library and the style the citations came
/// from, the run's generated headers, and the note itself.
///
/// The header goes on the command line rather than into the reader's defaults file: pandoc *adds* a
/// `--include-in-header` to whatever that file lists (measured), so the reader's own file is still
/// handed over untouched, and its own `include-in-header` entries are still included.
pub(crate) fn pandoc_arguments(
    dir: &Path,
    defaults: &Path,
    note: &Path,
    request: &ExportRequest,
    kind: &ExportKind,
    headers: &[PathBuf],
    package_defaults: Option<&Path>,
    template: Option<(&Path, &TemplateManifest)>,
    alias_root: Option<&Path>,
) -> Result<Vec<OsString>, String> {
    let output = absolute_output(&request.output_path, request.source_dir.as_deref());
    let mut arguments: Vec<OsString> = vec![
        OsString::from("--defaults"),
        defaults.as_os_str().to_os_string(),
    ];
    if let Some(package_defaults) = package_defaults {
        crate::export::templates::append_defaults(&mut arguments, package_defaults);
    }
    arguments.push(OsString::from("--output"));
    arguments.push(output.into_os_string());
    for header in headers {
        arguments.push(OsString::from("--include-in-header"));
        arguments.push(header.as_os_str().to_os_string());
    }
    if kind.kind == "html" {
        arguments.push(OsString::from(if request.self_contained {
            "--embed-resources=true"
        } else {
            "--embed-resources=false"
        }));
    }
    {
        let mut paths: Vec<PathBuf> = template
            .map(|(package, _)| vec![package.to_path_buf()])
            .unwrap_or_default();
        if let Some(root) = alias_root {
            paths.push(root.to_path_buf());
        }
        paths.extend(request.resource_paths.iter().map(PathBuf::from));
        if !paths.is_empty() {
            let joined = std::env::join_paths(&paths).map_err(|error| {
                crate::i18n::now(
                    "export.cannotSearch",
                    &[
                        ("path", request.output_path.as_str()),
                        ("reason", &error.to_string()),
                    ],
                )
            })?;
            arguments.push(OsString::from("--resource-path"));
            arguments.push(joined);
        }
    }
    let native_bibliography = kind.kind == "latex" && request.native_bibliography.is_some();
    // The library and the style the note's citations were formatted from. Pandoc appends the
    // reference list itself once it has a bibliography, so what is owed at the end of the document
    // is what citing the note in the app already showed the reader. A native-BibTeX package keeps
    // those arguments out of Pandoc: its template owns the bibliography directive.
    if !native_bibliography {
        if let Some(library) = request
            .bibliography
            .as_deref()
            .filter(|path| Path::new(path).exists())
        {
            arguments.push(OsString::from("--bibliography"));
            arguments.push(OsString::from(library));
            // The list pandoc appends is a section of the document, and a section has a name. Pandoc
            // leaves it unnamed unless it is told one, which reads as a page of references with nothing
            // introducing them.
            if let Some(title) = request
                .references
                .as_deref()
                .filter(|title| !title.is_empty())
            {
                arguments.push(OsString::from("--metadata"));
                arguments.push(OsString::from(format!("reference-section-title={title}")));
            }
            // And whether the reader wants that list at all: `suppress-bibliography` is *metadata* —
            // measured, the same word under `variables:` leaves the list exactly where it was — so it is
            // asked for beside the list's own name rather than as a variable.
            if request.suppress_references {
                arguments.push(OsString::from("--metadata"));
                arguments.push(OsString::from("suppress-bibliography=true"));
            }
        }
        if let Some(style) = &request.csl {
            arguments.push(OsString::from("--csl"));
            arguments.push(ensure_csl_in(dir, style)?.into_os_string());
        }
    }
    if let Some((package, manifest)) = template {
        match manifest.mode {
            TemplateMode::ReferenceDoc => {
                arguments.push(OsString::from("--reference-doc"));
                arguments.push(
                    crate::export::templates::manifest_file(package, manifest.entry())
                        .into_os_string(),
                );
            }
            TemplateMode::Template | TemplateMode::Wrapper => {
                arguments.push(OsString::from("--template"));
                arguments.push(
                    crate::export::templates::manifest_file(package, manifest.entry())
                        .into_os_string(),
                );
            }
        }
        // The package's style is handed over *after* the reader's own, so it wins for this export:
        // a journal kit's reference list should look like the journal's, not like the app's default.
        if let Some(csl) = &manifest.csl {
            arguments.push(OsString::from("--csl"));
            arguments.push(crate::export::templates::manifest_file(package, csl).into_os_string());
        }
    }
    // What the note is called, and the language it is in — for the kinds that carry their own name
    // or must declare a language (see `ExportKind`). The window sends both whatever the kind is, and
    // the kind's own row decides: a docx whose body already opens with the note's own heading would
    // say that name twice, and a `lang` in a LaTeX run picks a hyphenation package by language.
    let metadata = |key: &str, value: Option<&str>| {
        let value = value.map(str::trim).filter(|value| !value.is_empty());
        value.map(|value| (key.to_string(), format!("{key}={value}")))
    };
    let named = kind
        .takes_a_title
        .then(|| metadata("title", request.title.as_deref()))
        .flatten();
    let spoken = kind
        .needs_a_language
        .then(|| metadata("lang", request.language.as_deref()))
        .flatten();
    for (_, pair) in named.into_iter().chain(spoken) {
        arguments.push(OsString::from("--metadata"));
        arguments.push(OsString::from(pair));
    }
    // The page a reader asked the card for, on the one kind whose engine lays one out
    // (`takes_a_page_size`). Nothing at all is passed for a reader who left the card's own answer —
    // *the settings file's own* — where it was: the file is theirs, and the page they set up there is
    // what an export that asks for nothing gets. See `PAPER_SIZES` for why a size is a `geometry`
    // option rather than a `papersize` variable.
    if kind.takes_a_page_size {
        let paper = request
            .paper
            .as_deref()
            .map(str::trim)
            .filter(|paper| !paper.is_empty());
        if let Some(paper) = paper {
            if !PAPER_SIZES.iter().any(|(_, value)| *value == paper) {
                return Err(crate::i18n::now("export.unknownPaper", &[("paper", paper)]));
            }
            arguments.push(OsString::from("--variable"));
            arguments.push(OsString::from(format!("geometry={paper}")));
        }
        if let Some(landscape) = request.landscape {
            arguments.push(OsString::from("--variable"));
            arguments.push(OsString::from(if landscape {
                "geometry=landscape"
            } else {
                "geometry=portrait"
            }));
        }
    }
    arguments.push(note.as_os_str().to_os_string());
    Ok(arguments)
}

/// Resolves the package the window named, and refuses one that does not fit the kind. The id is
/// the only thing the window sends; the path comes from the app's own folder.
pub(super) fn resolve_template(
    app: &tauri::AppHandle,
    kind: &ExportKind,
    id: Option<&str>,
) -> Result<Option<(PathBuf, TemplateManifest)>, String> {
    let Some(id) = id.map(str::trim).filter(|id| !id.is_empty()) else {
        return Ok(None);
    };
    if kind.template_mode == KindTemplate::None {
        return Err(crate::i18n::now(
            "template.noTemplateKind",
            &[("kind", kind.kind)],
        ));
    }
    let (path, manifest) = crate::export::templates::resolve_package(app, id)?;
    if manifest.kind != kind.kind {
        return Err(crate::i18n::now(
            "template.wrongKind",
            &[("kind", &manifest.kind), ("asked", kind.kind)],
        ));
    }
    if manifest.mode == TemplateMode::ReferenceDoc
        && kind.template_mode != KindTemplate::ReferenceDoc
    {
        return Err(crate::i18n::now(
            "template.textKind",
            &[("kind", kind.kind)],
        ));
    }
    if manifest.mode != TemplateMode::ReferenceDoc && kind.template_mode != KindTemplate::Text {
        return Err(crate::i18n::now(
            "template.referenceKind",
            &[("kind", kind.kind)],
        ));
    }
    let entry = crate::export::templates::manifest_file(&path, manifest.entry());
    if !entry.is_file() {
        return Err(crate::i18n::now(
            "template.entryMissing",
            &[("file", manifest.entry())],
        ));
    }
    Ok(Some((path, manifest)))
}
