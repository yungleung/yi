//! One export: the note handed to pandoc, its arguments, and the file left behind.
//!
//! The app writes the note to its own scratch file, asks pandoc through the pandoc seam, removes the
//! scratch files whatever happened, and answers with pandoc's warnings.
//!
//! May import: the kind vocabulary, the export folder, the pandoc seam and the font family. Upholds:
//! every pandoc call goes through `pandoc::run_pandoc`, and a run leaves no scratch note or remote
//! picture behind.

use serde::Serialize;
use std::collections::BTreeSet;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use super::config::{ensure_csl_in, ensure_defaults_in, export_dir, remote_dir, settings_text, CslStyle};
use super::kinds::{kind_of, ExportKind, KindTemplate, PAPER_SIZES, TemplateMode};
use super::pandoc::{find_pandoc, run_pandoc};
use super::templates::TemplateManifest;
use super::templates::{reference_to, safe_prefix};

/// What an export did: whether it wrote the file, and what pandoc said on the way.
#[derive(Debug, Serialize, Clone)]
pub struct ExportOutcome {
    /// Pandoc's own warnings — a picture it could not fetch, a citation it could not resolve. They
    /// are the *reason* a document is not quite what the reader asked for, so they are not thrown
    /// away: the window says them.
    pub warnings: Vec<String>,
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
}
/// Writes the note where pandoc reads files, and says where: a name of the app's own inside its
/// data folder, so nothing appears in the reader's own notes folder and no two exports collide.
fn write_note(dir: &Path, text: &str) -> Result<PathBuf, String> {
    let scratch = dir.join("tmp");
    fs::create_dir_all(&scratch)
        .map_err(|error| crate::i18n::now("export.cannotMake", &[("path", &scratch.display().to_string()), ("reason", &error.to_string())]))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or(0);
    let path = scratch.join(format!("note-{}-{stamp}.md", std::process::id()));
    fs::write(&path, text).map_err(|error| crate::i18n::now("export.cannotWrite", &[("path", &path.display().to_string()), ("reason", &error.to_string())]))?;
    Ok(path)
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
    // A template's own relative links may name the folder it was written in (`template/css/…`).
    // The package is stored under its id, so it is staged under the original basename too while
    // pandoc reads it; a self-contained HTML then embeds those local files.
    let alias = match &template {
        Some((package, manifest)) => {
            let root = dir
                .join("tmp")
                .join(format!("template-resources-{}", nanos()));
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
        template.as_ref().map(|(path, manifest)| (path.as_path(), manifest)),
        alias.as_ref().map(|(root, _)| root.as_path()),
    )
    .and_then(|arguments| {
        // The PDF engine resolves `\documentclass{journal}` and `\usepackage{…}` from the folder
        // it is run in, so a package is that folder. The note, defaults and output are absolute,
        // which is what keeps that current directory from changing what the other paths mean.
        let working = template
            .as_ref()
            .filter(|_| kind.kind == "pdf")
            .map(|(package, _)| package.as_path())
            .or_else(|| request.source_dir.as_deref().map(Path::new));
        run_pandoc(&pandoc, &arguments, working).map(|warnings| ExportOutcome { warnings })
    })
    .and_then(|outcome| {
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

/// The whole of what the app asks pandoc for: the kind's own defaults file, the destination, the
/// folders a relative destination is resolved against, the library and the style the citations came
/// from, the header that wires in the fonts this build ships (`fonts::bundled`), and the note itself.
///
/// The header goes on the command line rather than into the reader's defaults file: pandoc *adds* a
/// `--include-in-header` to whatever that file lists (measured), so the reader's own file is still
/// handed over untouched, and its own `include-in-header` entries are still included.
pub(super) fn pandoc_arguments(
    dir: &Path,
    defaults: &Path,
    note: &Path,
    request: &ExportRequest,
    kind: &ExportKind,
    header: Option<&Path>,
    template: Option<(&Path, &TemplateManifest)>,
    alias_root: Option<&Path>,
) -> Result<Vec<OsString>, String> {
    let output = absolute_output(&request.output_path, request.source_dir.as_deref());
    let mut arguments: Vec<OsString> = vec![
        OsString::from("--defaults"),
        defaults.as_os_str().to_os_string(),
        OsString::from("--output"),
        output.into_os_string(),
    ];
    if let Some(header) = header {
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
        let joined = std::env::join_paths(&paths)
            .map_err(|error| crate::i18n::now("export.cannotSearch", &[("path", request.output_path.as_str()), ("reason", &error.to_string())]))?;
        arguments.push(OsString::from("--resource-path"));
        arguments.push(joined);
        }
    }
    // The library and the style the note's citations were formatted from. Pandoc appends the
    // reference list itself once it has a bibliography, so what is owed at the end of the document
    // is what citing the note in the app already showed the reader.
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
        if let Some(title) = request.references.as_deref().filter(|title| !title.is_empty()) {
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
    if let Some((package, manifest)) = template {
        match manifest.mode {
            TemplateMode::ReferenceDoc => {
                arguments.push(OsString::from("--reference-doc"));
                arguments.push(
                    super::templates::manifest_file(package, manifest.entry())
                        .into_os_string(),
                );
            }
            TemplateMode::Template | TemplateMode::Wrapper => {
                arguments.push(OsString::from("--template"));
                arguments.push(
                    super::templates::manifest_file(package, manifest.entry())
                        .into_os_string(),
                );
            }
        }
        // The package's style is handed over *after* the reader's own, so it wins for this export:
        // a journal kit's reference list should look like the journal's, not like the app's default.
        if let Some(csl) = &manifest.csl {
            arguments.push(OsString::from("--csl"));
            arguments.push(
                super::templates::manifest_file(package, csl).into_os_string(),
            );
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
fn resolve_template(
    app: &tauri::AppHandle,
    kind: &ExportKind,
    id: Option<&str>,
) -> Result<Option<(PathBuf, TemplateManifest)>, String> {
    let Some(id) = id.map(str::trim).filter(|id| !id.is_empty()) else {
        return Ok(None);
    };
    if kind.template_mode == KindTemplate::None {
        return Err(crate::i18n::now("template.noTemplateKind", &[("kind", kind.kind)]));
    }
    let (path, manifest) = super::templates::resolve_package(app, id)?;
    if manifest.kind != kind.kind {
        return Err(crate::i18n::now(
            "template.wrongKind",
            &[("kind", &manifest.kind), ("asked", kind.kind)],
        ));
    }
    if manifest.mode == TemplateMode::ReferenceDoc
        && kind.template_mode != KindTemplate::ReferenceDoc
    {
        return Err(crate::i18n::now("template.textKind", &[("kind", kind.kind)]));
    }
    if manifest.mode != TemplateMode::ReferenceDoc && kind.template_mode != KindTemplate::Text {
        return Err(crate::i18n::now("template.referenceKind", &[("kind", kind.kind)]));
    }
    let entry = super::templates::manifest_file(&path, manifest.entry());
    if !entry.is_file() {
        return Err(crate::i18n::now(
            "template.entryMissing",
            &[("file", manifest.entry())],
        ));
    }
    Ok(Some((path, manifest)))
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
    for name in asset_names(manifest) {
        copy_asset(
            &super::templates::manifest_file(package, &name),
            &folder.join(&name),
        )?;
    }
    Ok(())
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
    for prefix in prefixes {
        for asset in &assets {
            copy_asset(
                &super::templates::manifest_file(package, asset),
                &folder.join(&prefix).join(asset),
            )?;
        }
    }
    Ok(())
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

fn nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or(0)
}

/// The output path as the run means it. Pandoc is run in the package folder for a PDF, so a
/// relative destination from a caller has to become the one the reader saw.
fn absolute_output(path: &str, source_dir: Option<&str>) -> PathBuf {
    let path = PathBuf::from(path);
    if path.is_absolute() {
        return path;
    }
    let base = source_dir
        .map(PathBuf::from)
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_default();
    base.join(path)
}
