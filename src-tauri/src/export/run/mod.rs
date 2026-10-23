//! One export: the note handed to pandoc, its arguments, and the file left behind.
//!
//! The app writes the note to its own scratch file, asks pandoc through the pandoc seam, removes the
//! scratch files whatever happened, and answers with pandoc's warnings.
//!
//! May import: the kind vocabulary, the export folder, the pandoc seam, the font family and the
//! template package rules. Upholds: every pandoc call goes through `pandoc::run_pandoc`, package
//! defaults override the app's defaults but not explicit export paths, and a run leaves no scratch
//! note or remote picture behind.

use serde::Serialize;
use std::fs;
use std::path::Path;

use super::config::{ensure_defaults_in, export_dir, remote_dir, settings_text, CslStyle};
use super::kinds::{kind_of, ExportKind};
use super::pandoc::{find_pandoc, run_pandoc_with_env};

mod environment;
mod arguments;
mod delivery;

pub(super) use arguments::pandoc_arguments;
use arguments::resolve_template;
use delivery::deliver_package_assets;
pub(super) use delivery::deliver_note_assets;
#[cfg(test)]
pub(super) use delivery::{deliver_html_assets, deliver_latex_assets};
use environment::{absolute_output, write_note};
pub(super) use environment::pdf_environment;

/// What an export did: whether it wrote the file, and what pandoc said on the way.
#[derive(Debug, Serialize, Clone)]
pub struct ExportOutcome {
    /// Pandoc's own warnings — a picture it could not fetch, a citation it could not resolve. They
    /// are the *reason* a document is not quite what the reader asked for, so they are not thrown
    /// away: the window says them.
    pub warnings: Vec<String>,
}

/// The filtered BibTeX for a native-BibTeX package, and where its template expects it.
#[derive(Debug, serde::Deserialize)]
pub struct NativeBibliography {
    /// A `/`-separated path inside the output folder, conventionally `references.bib`.
    pub path: String,
    /// The cited entries already converted from the reader's selected library.
    pub text: String,
}

/// A note-local picture and the relative path a LaTeX source will use for it.
#[derive(Debug, serde::Deserialize)]
pub struct NoteAsset {
    pub source: String,
    pub target: String,
}

/// The note to write and where to write it, as the window asks for it.
#[derive(Debug, serde::Deserialize)]
pub struct ExportRequest {
    pub kind: String,
    /// The note's text, exactly as the editor holds it: a document no file has yet may still be
    /// exported, and a keystroke made a moment ago is in it.
    pub text: String,
    pub output_path: String,
    /// The folders a relative destination in the note is resolved against, in the app's order of
    /// preference: the note's own folder first, then where the settings say images go.
    #[serde(default)]
    pub resource_paths: Vec<String>,
    /// The folder the note itself sits in, when it has one. pandoc is run *there*, so a path in the
    /// note and a path in the defaults file both mean what the reader sees them mean.
    #[serde(default)]
    pub source_dir: Option<String>,
    /// The library the citations in the note were formatted from, as the settings name it — or
    /// null when they name none.
    #[serde(default)]
    pub bibliography: Option<String>,
    /// The CSL style the editor formats citations with, so the reference list pandoc appends is the
    /// style the page showed. Null when citation-js bundles no such style.
    #[serde(default)]
    pub csl: Option<CslStyle>,
    /// What that list is called, in the language the app is speaking. A word, so it arrives from the
    /// window's catalogue with every other word the app says (`locales/*.json`).
    #[serde(default)]
    pub references: Option<String>,
    /// What the note is called, as the app knows it: its frontmatter title, else its first heading,
    /// else its file's name. Used by the kinds that carry their own name (`takes_a_title`), and
    /// ignored by the kinds whose body already says it.
    #[serde(default)]
    pub title: Option<String>,
    /// The page the reader asked for in the card, for a kind that takes one (`takes_a_page_size`): one
    /// of [`PAPER_SIZES`]'s values, or null for *the settings file's own* — which is where the reader
    /// sets the page they usually want, and what an export that asks nothing gets.
    #[serde(default)]
    pub paper: Option<String>,
    /// Which way up the reader asked for that page: `Some(true)` landscape, `Some(false)` portrait —
    /// asked for *explicitly*, so it wins over the reader's own file, which may say landscape — and
    /// `None` for *the settings file's own*, the same answer an untouched card gives.
    #[serde(default)]
    pub landscape: Option<bool>,
    /// Whether the reader asked for the citations to be **resolved with no list at the end** — the
    /// card's own checkbox. Pandoc is told in *metadata* (`suppress-bibliography`), which is measured:
    /// the same word under `variables:` leaves the list exactly where it was, while a file's own
    /// `metadata:` block and this record both take it away. It means nothing without a bibliography, so
    /// it is passed only when there is one.
    #[serde(default)]
    pub suppress_references: bool,
    /// The language the note is written in, as the app knows it: the frontmatter's `lang:`, else the
    /// language the app is speaking. Used by the kinds that must declare one (`needs_a_language`).
    #[serde(default)]
    pub language: Option<String>,
    /// The package this export was asked to use, by id, or null for pandoc's default. The backend
    /// resolves the id under the app's export folder; a path from the window is never trusted.
    #[serde(default)]
    pub template_id: Option<String>,
    /// Whether an HTML page should embed its local files. The card's box is off by default; the
    /// command-line value is explicit so an older defaults file cannot silently turn it back on.
    #[serde(default)]
    pub self_contained: bool,
    /// The cited part of the reader's selected library, for a LaTeX package that keeps native
    /// `\cite` and BibTeX instead of citeproc. The window computes this from the Markdown parse.
    #[serde(default)]
    pub native_bibliography: Option<NativeBibliography>,
    /// Pictures the note refers to, copied into a generated bundle beside a LaTeX source.
    #[serde(default)]
    pub note_assets: Vec<NoteAsset>,
}
/// Exports the note: the kind the reader chose, in pandoc's own hands.
pub fn run_export(
    app: tauri::AppHandle,
    mut request: ExportRequest,
) -> Result<ExportOutcome, String> {
    let kind = kind_of(&request.kind)?;
    if kind.kind == "html" {
        let (_, page) = super::html_media::html_output(&request.output_path)?;
        request.output_path = page.to_string_lossy().into_owned();
    }
    if kind.needs_pandoc {
        export_with_pandoc(&app, kind, &request)
    } else {
        export_own_text(&request)
    }
}

/// The kind the app writes itself: the text it was handed is the answer.
///
/// `markdown` is that kind (`needs_pandoc: false`): the note with its wikilinks written as the words
/// they render as, its citations as the words *they* read as, and the works they name listed under
/// them (`ui/export/preprocess.ts`). Re-serializing that through pandoc would be a second conversion
/// of a text that is already the answer.
fn export_own_text(request: &ExportRequest) -> Result<ExportOutcome, String> {
    crate::files::write_atomically(Path::new(&request.output_path), &request.text)
        .map_err(|error| crate::i18n::now("export.cannotWrite", &[("path", request.output_path.as_str()), ("reason", &error.to_string())]))?;
    Ok(ExportOutcome { warnings: Vec::new() })
}

/// The whole of an export: pandoc, the kind's own defaults file, and the note written out for it to
/// read.
fn export_with_pandoc(
    app: &tauri::AppHandle,
    kind: &ExportKind,
    request: &ExportRequest,
) -> Result<ExportOutcome, String> {
    // Refused *before* anything is written: an export that cannot run should not leave a file of the
    // reader's text in the app's data folder.
    let pandoc = find_pandoc()
        .0
        .ok_or_else(|| crate::i18n::now("export.noPandoc", &[]))?;
    let dir = export_dir(app)?;
    let defaults = ensure_defaults_in(&dir, kind)?;
    let template = resolve_template(app, kind, request.template_id.as_deref())?;
    let template_defaults = template
        .as_ref()
        .and_then(|(package, _)| super::templates::package_defaults(package));
    if kind.kind == "pdf" {
        if let Some(defaults) = &template_defaults {
            super::templates::ensure_pdf_defaults_safe(defaults)?;
        }
    }
    // A template's own relative links may name the folder it was written in (`template/css/…`).
    // The package is stored under its id, so it is staged under the original basename too while
    // pandoc reads it; a self-contained HTML then embeds those local files.
    let alias = match &template {
        Some((package, manifest)) => {
            let root = dir
                .join("tmp")
                .join(format!("template-resources-{}", environment::nanos()));
            let names = super::templates::stage_alias(package, manifest, &root)?;
            Some((root, names))
        }
        None => None,
    };
    // The faces this build ships, for the kinds whose page is drawn by them: the header names them by
    // absolute path, so it is written per export rather than once — an app that has been replaced
    // since the last export would leave a header pointing into a bundle that is gone. Han and kana
    // follow a `CJKmainfont` the file names, so the name is read from the file pandoc is about to be
    // handed, and not from a file of the app's own.
    let header = kind
        .ships_fonts
        .then(|| {
            let settings = settings_text(app, kind)?;
            let faces = crate::fonts::bundled::fonts_dir(app)?;
            crate::fonts::bundled::write_header(&dir, &faces, &settings)
        })
        .transpose()?;
    let note = write_note(&dir, &request.text)?;
    let result = pandoc_arguments(
        &dir,
        &defaults,
        &note,
        request,
        kind,
        header.as_deref(),
        template_defaults.as_deref(),
        template.as_ref().map(|(path, manifest)| (path.as_path(), manifest)),
        alias.as_ref().map(|(root, _)| root.as_path()),
    )
    .and_then(|arguments| {
        // The PDF engine resolves `\documentclass{journal}` and `\usepackage{…}` from the folder
        // it is run in, so a package is that folder. The note, defaults and output are absolute,
        // which is what keeps that current directory from changing what the other paths mean.
        let (working, environment) = match &template {
            Some((package, manifest)) if kind.kind == "pdf" => {
                pdf_environment(package, manifest)
            }
            // A package's filters and metadata files use paths relative to its own root. The note
            // and every destination the app supplies are absolute, so this working directory is
            // the package's own context without changing what any other argument means.
            Some((package, _)) => (Some(package.clone()), Vec::new()),
            None => (
                request
                    .source_dir
                    .as_deref()
                    .map(Path::new)
                    .map(Path::to_path_buf),
                Vec::new(),
            ),
        };
        run_pandoc_with_env(
            &pandoc,
            &arguments,
            working.as_deref(),
            &environment,
        )
        .map(|warnings| ExportOutcome { warnings })
    })
    .and_then(|outcome| {
        if kind.kind == "odt" {
            let output = absolute_output(&request.output_path, request.source_dir.as_deref());
            super::odt_toc::cache_contents(&output)?;
        }
        if kind.kind == "html" {
            let output = absolute_output(&request.output_path, request.source_dir.as_deref());
            super::html_media::package_html_media(&output)?;
        }
        if let Some((package, manifest)) = &template {
            deliver_package_assets(
                package,
                manifest,
                request,
                kind,
            )?;
        }
        if kind.kind == "latex" {
            deliver_note_assets(request)?;
        }
        Ok(outcome)
    });
    // The note's copy under the app's data folder is a thing of this call, whatever pandoc said —
    // and so are the pictures fetched for it. A picture is re-fetched rather than remembered: the
    // page it came from may have changed since the last export.
    let _ = fs::remove_file(&note);
    if let Some((root, _)) = &alias {
        let _ = fs::remove_dir_all(root);
    }
    let _ = fs::remove_dir_all(remote_dir(&dir));
    result
}

