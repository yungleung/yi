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
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::config::{ensure_defaults_in, export_dir, remote_dir, settings_text, CslStyle};
use super::kinds::{kind_of, ExportKind};
use super::pandoc::{find_pandoc, run_pandoc_with_env};
use super::templates::TemplateManifest;
use super::templates::{reference_to, safe_prefix};

mod environment;
mod arguments;

pub(super) use arguments::pandoc_arguments;
use arguments::resolve_template;
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

/// Copies the package's sidecar files where the output still refers to them.
///
/// A LaTeX output is compiled elsewhere, so every asset travels beside the `.tex` (class, style,
/// bibliography, figures). An HTML whose reader settings turn self-contained off keeps its links,
/// so the asset tree is copied under each relative prefix the finished page uses. EPUB, DOCX, ODT
/// and PDF are containers: their assets are read by pandoc or the engine, and the output is whole.
fn deliver_package_assets(
    package: &Path,
    manifest: &TemplateManifest,
    request: &ExportRequest,
    kind: &ExportKind,
) -> Result<(), String> {
    if kind.kind == "latex" {
        return deliver_latex_assets(package, manifest, request);
    }
    if kind.kind == "epub" {
        let output = absolute_output(&request.output_path, request.source_dir.as_deref());
        return super::templates::pack_epub(&output, package, manifest);
    }
    if kind.kind != "html" {
        return Ok(());
    }
    let output = absolute_output(&request.output_path, request.source_dir.as_deref());
    deliver_html_assets(package, manifest, &output)
}

/// A `.tex` is only useful with what it names: the whole asset tree goes beside it.
pub(super) fn deliver_latex_assets(
    package: &Path,
    manifest: &TemplateManifest,
    request: &ExportRequest,
) -> Result<(), String> {
    let output = absolute_output(&request.output_path, request.source_dir.as_deref());
    let folder = output
        .parent()
        .ok_or_else(|| crate::i18n::now("export.noTarget", &[]))?;
    let native = request
        .native_bibliography
        .as_ref()
        .map(|bibliography| {
            safe_bibliography_path(&bibliography.path).map(|path| (bibliography, path))
        })
        .transpose()?;
    for name in asset_names(manifest) {
        if native
            .as_ref()
            .is_some_and(|(bibliography, _)| bibliography.path == name)
            || request
                .note_assets
                .iter()
                .any(|asset| asset.target == name)
        {
            continue;
        }
        copy_asset(
            &super::templates::manifest_file(package, &name),
            &folder.join(&name),
        )?;
    }
    if let Some((bibliography, path)) = native {
        let target = folder.join(path);
        if target.is_dir() {
            return Err(crate::i18n::now(
                "template.outputConflict",
                &[("file", &target.display().to_string())],
            ));
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                crate::i18n::now(
                    "export.cannotMake",
                    &[("path", &parent.display().to_string()), ("reason", &error.to_string())],
                )
            })?;
        }
        crate::files::write_atomically(&target, &bibliography.text).map_err(|error| {
            crate::i18n::now(
                "export.cannotWrite",
                &[("path", &target.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
    }
    Ok(())
}

/// A native bibliography is a relative `.bib` inside the output folder, never an absolute path or a
/// climb out of the source tree the reader will compile.
fn safe_bibliography_path(path: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    let safe = !path.is_empty()
        && !path.contains('\\')
        && !candidate.is_absolute()
        && candidate
            .components()
            .all(|component| matches!(component, std::path::Component::Normal(_)))
        && candidate
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("bib"));
    if safe {
        Ok(candidate.to_path_buf())
    } else {
        Err(crate::i18n::now(
            "template.badPath",
            &[("file", path)],
        ))
    }
}

/// A LaTeX note picture is copied under the generated `<stem>.assets/` tree beside its `.tex`.
pub(super) fn deliver_note_assets(request: &ExportRequest) -> Result<(), String> {
    if request.note_assets.is_empty() {
        return Ok(());
    }
    let output = absolute_output(&request.output_path, request.source_dir.as_deref());
    let folder = output
        .parent()
        .ok_or_else(|| crate::i18n::now("export.noTarget", &[]))?;
    for asset in &request.note_assets {
        let target = folder.join(safe_note_asset_path(&asset.target)?);
        copy_bundle_asset(Path::new(&asset.source), &target)?;
    }
    Ok(())
}

fn safe_note_asset_path(path: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    let safe = !path.contains('\\')
        && !candidate.is_absolute()
        && candidate
            .components()
            .all(|component| matches!(component, std::path::Component::Normal(_)))
        && candidate
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                matches!(
                    extension.to_ascii_lowercase().as_str(),
                    "avif"
                        | "gif"
                        | "jpeg"
                        | "jpg"
                        | "pdf"
                        | "png"
                        | "svg"
                        | "tif"
                        | "tiff"
                        | "webp"
                )
            });
    if safe {
        Ok(candidate.to_path_buf())
    } else {
        Err(crate::i18n::now(
            "template.badPath",
            &[("file", path)],
        ))
    }
}

/// An HTML page that is not self-contained keeps its relative links, so the assets go beside it
/// under the same prefixes. The finished page is read rather than the template: a self-contained
/// page has already inlined these files, and copying them again would be clutter.
pub(super) fn deliver_html_assets(
    package: &Path,
    manifest: &TemplateManifest,
    output: &Path,
) -> Result<(), String> {
    let Ok(text) = fs::read_to_string(output) else {
        return Ok(());
    };
    let folder = output
        .parent()
        .ok_or_else(|| crate::i18n::now("export.noTarget", &[]))?;
    let assets = asset_names(manifest);
    let mut prefixes = BTreeSet::new();
    for asset in &assets {
        if let Some(reference) = reference_to(&text, asset) {
            if let Some(prefix) = reference.strip_suffix(asset.as_str()) {
                if safe_prefix(prefix) {
                    prefixes.insert(prefix.to_string());
                }
            }
        }
    }
    // Even a self-contained page may not name every file a journal kit carries. The reader asked
    // for a bundle folder, so the whole package travels there; with no link to infer a prefix from,
    // use the folder name the template was written in.
    if prefixes.is_empty() {
        prefixes.insert(html_bundle_prefix(manifest, &assets));
    }
    for prefix in prefixes {
        for asset in &assets {
            let target = folder.join(&prefix).join(asset);
            // A kit may ship a sample with the same name as the page being written (`Yuki` ships
            // `default-document.html`). The generated page is the output; an asset may never
            // replace it with a stale sample.
            if target == output {
                continue;
            }
            copy_bundle_asset(
                &super::templates::manifest_file(package, asset),
                &target,
            )?;
        }
    }
    Ok(())
}

/// A file inside the HTML bundle belongs to the export that created it. Re-exporting over an old
/// bundle replaces the generated copy; a reader's *output* folder elsewhere is still protected by
/// [`copy_asset`] for LaTeX.
fn copy_bundle_asset(source: &Path, target: &Path) -> Result<(), String> {
    if target.is_dir() {
        return Err(crate::i18n::now(
            "template.outputConflict",
            &[("file", &target.display().to_string())],
        ));
    }
    if target.exists() {
        fs::remove_file(target).map_err(|error| {
            crate::i18n::now(
                "export.cannotWrite",
                &[("path", &target.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            crate::i18n::now(
                "export.cannotMake",
                &[("path", &parent.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
    }
    fs::copy(source, target).map_err(|error| {
        crate::i18n::now(
            "export.cannotWrite",
            &[("path", &target.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    Ok(())
}

fn html_bundle_prefix(manifest: &TemplateManifest, assets: &[String]) -> String {
    let aliases = super::templates::alias_names(manifest);
    if aliases.iter().any(|alias| {
        assets
            .iter()
            .any(|asset| asset.starts_with(&format!("{alias}/")))
    }) {
        return String::new();
    }
    aliases
        .into_iter()
        .find(|alias| alias != &manifest.id)
        .map(|alias| format!("{alias}/"))
        .unwrap_or_default()
}

/// The package's files that are not its entry. The CSL is already in `assets` for a new package;
/// an older manifest may list it only in `csl`, so it is included once either way.
fn asset_names(manifest: &TemplateManifest) -> Vec<String> {
    let mut names = manifest.assets.clone();
    if let Some(csl) = &manifest.csl {
        names.push(csl.clone());
    }
    names.sort();
    names.dedup();
    names
}

/// One copied asset. A different file already at the destination is the reader's and is not
/// overwritten: the export names the conflict instead.
fn copy_asset(source: &Path, target: &Path) -> Result<(), String> {
    if target.exists() {
        if let (Ok(source), Ok(target)) = (fs::read(source), fs::read(target)) {
            if source == target {
                return Ok(());
            }
        }
        return Err(crate::i18n::now(
            "template.outputConflict",
            &[("file", &target.display().to_string())],
        ));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            crate::i18n::now(
                "export.cannotMake",
                &[("path", &parent.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
    }
    fs::copy(source, target).map_err(|error| {
        crate::i18n::now(
            "export.cannotWrite",
            &[("path", &target.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    Ok(())
}

