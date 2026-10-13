//! Turning the note on screen into a file another program can read.
//!
//! The conversion is pandoc's, and so are its parameters: each kind of export is a YAML *defaults
//! file* in the app's data folder (`<data>/export/export.<kind>.yaml`), written there from the copy
//! this build ships the first time that kind is used, and handed to pandoc as `--defaults`. Nothing
//! here parses it — what it says is pandoc's business, and a key it does not know is answered by
//! pandoc's own complaint. A file that is already there is never overwritten, so an edit stands.
//!
//! What *is* the app's business:
//!
//! - **which kinds exist** ([`KINDS`]): one row per kind — the name, the extension its output is
//!   written under, whether pandoc is needed for it at all, and the defaults file's bytes, compiled
//!   in. A kind is added by adding a row and its asset; nothing else in the app lists kinds.
//! - **which pandoc may be run** ([`find_pandoc`]): never `PATH` alone, because an app started from
//!   Finder inherits no shell's `PATH` — the known places are searched first, and `YI_PANDOC`, or
//!   [`export_use_pandoc`] for a probe (which cannot change the environment of the app it drives),
//!   comes before both. A name that is not there means *no pandoc*, never a different one.
//! - **the note handed over**: the text is written to a file under the app's data folder, because
//!   pandoc reads files, and that file is deleted again whether pandoc succeeded or not.
//! - **the two things the app knows and pandoc does not**: the library the note's citations were
//!   formatted from, and the style they were formatted in. Handing citeproc a `--bibliography` is
//!   what makes it resolve the keys *and append the reference list* the reader asked for; the style
//!   arrives as CSL text from citation-js (`src/services/bibliography.ts`), because a style the
//!   app *names* (`apa`) is not a style pandoc can read. A library that is not there is not named
//!   at all: pandoc exits non-zero on a file it cannot read, and a note with citations is better
//!   exported without its references than not exported.
//!
//! Every call the app makes to pandoc goes through [`run_pandoc`] — one list in one place, and the
//! list `test/probes/export-pandoc-arguments.js` holds to with a pandoc that only records.

use serde::Serialize;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::Manager;


/// One kind of export the app knows.
#[derive(Debug)]
pub struct ExportKind {
    /// The name this kind is asked for by, and the one in its config file's name.
    pub kind: &'static str,
    /// The extension an output of this kind is written under.
    pub extension: &'static str,
    /// Whether the conversion is pandoc's at all. PDF will say no: it is the one kind the app can
    /// also write itself, and the reader chooses which hand does it.
    pub needs_pandoc: bool,
    /// The defaults file this build ships, as its own bytes: what a reader's copy starts as.
    pub defaults: &'static str,
}

/// Every kind of export this build ships, in the order the dialog shows them.
pub const KINDS: &[ExportKind] = &[ExportKind {
    kind: "docx",
    extension: "docx",
    needs_pandoc: true,
    // Zettlr's own defaults, kept word for word (see the file's header): the shape a reader who
    // knows that app already knows, and a set of pandoc parameters worth respecting.
    defaults: include_str!("../assets/export/export.docx.yaml"),
}];

/// A kind of export as the window reads it: its own facts, and where its config file lives.
#[derive(Debug, Serialize, Clone)]
pub struct ExportKindInfo {
    pub kind: String,
    pub extension: String,
    pub needs_pandoc: bool,
    /// Where the reader's copy of the defaults file is — there whether or not it exists yet.
    pub config_path: String,
    /// Whether that copy has been written yet. A missing one is made by the first export or by
    /// opening it for editing; a query never writes.
    pub config_exists: bool,
}

/// What the export dialog is built from: the kinds, and the pandoc the app would run.
#[derive(Debug, Serialize, Clone)]
pub struct ExportKinds {
    /// The pandoc found, or `None` when the machine has none — the dialog's *cannot export*.
    pub pandoc: Option<String>,
    pub kinds: Vec<ExportKindInfo>,
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
}

/// A CSL style as the window can hand it over: the name it is known by, and its own text.
#[derive(Debug, serde::Deserialize, Serialize, Clone)]
pub struct CslStyle {
    pub name: String,
    pub xml: String,
}

/// The kind asked for, or the one sentence worth saying when the app does not have it.
fn kind_of(kind: &str) -> Result<&'static ExportKind, String> {
    KINDS
        .iter()
        .find(|known| known.kind == kind)
        .ok_or_else(|| format!("Yi has no {kind} export to run."))
}

/// The name a kind's defaults file has in the export folder: the one fact the app writes down about
/// where a config lives, so a reader looking for it is looking for the name this made.
fn config_file_name(kind: &str) -> String {
    format!("export.{kind}.yaml")
}

/// Where the app keeps what the reader may edit: one folder under its own data folder.
fn export_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|data| data.join("export"))
        .map_err(|error| format!("Yi cannot find its own data folder: {error}"))
}

/// The reader's copy of a kind's defaults file, written from the shipped one when it is not there.
///
/// The write happens **once**: a file that exists is left exactly as it is, because the point of
/// keeping it on the disk is that an edited one stays edited.
fn ensure_defaults_in(dir: &Path, kind: &ExportKind) -> Result<PathBuf, String> {
    fs::create_dir_all(dir)
        .map_err(|error| format!("Yi cannot make {}: {error}", dir.display()))?;
    let path = dir.join(config_file_name(kind.kind));
    if !path.exists() {
        fs::write(&path, kind.defaults)
            .map_err(|error| format!("Yi cannot write {}: {error}", path.display()))?;
    }
    Ok(path)
}

/// The name a style file may have: the style's own name when it is one, and `style` when it is not.
///
/// The name comes from a config value a reader may type anything into, and it ends up in a path, so
/// it is *filtered* rather than trusted: a name that is not made of letters, digits, dots, dashes
/// and underscores cannot name a file below the folder it is put in.
fn style_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_')
        })
        .collect();
    if cleaned.is_empty() || cleaned.starts_with('.') {
        "style".to_string()
    } else {
        cleaned
    }
}

/// A CSL style as a file pandoc can read, under the app's export folder, and where it is.
///
/// Written when the text differs and left alone when it does not: the app hands the same style over
/// on every export, and a file rewritten each time would be one a launcher watching that folder
/// would see change for nothing.
fn ensure_csl_in(dir: &Path, style: &CslStyle) -> Result<PathBuf, String> {
    let styles = dir.join("styles");
    fs::create_dir_all(&styles)
        .map_err(|error| format!("Yi cannot make {}: {error}", styles.display()))?;
    let path = styles.join(format!("{}.csl", style_file_name(&style.name)));
    if fs::read_to_string(&path).ok().as_deref() != Some(style.xml.as_str()) {
        fs::write(&path, &style.xml)
            .map_err(|error| format!("Yi cannot write {}: {error}", path.display()))?;
    }
    Ok(path)
}

/// The known places a pandoc lives on a Mac, before `PATH` is consulted at all.
fn known_pandoc_locations() -> Vec<PathBuf> {
    vec![
        PathBuf::from("/opt/homebrew/bin/pandoc"),
        PathBuf::from("/usr/local/bin/pandoc"),
        PathBuf::from("/usr/bin/pandoc"),
    ]
}

/// The pandoc a probe has pointed the app at, if it has. `YI_PANDOC` is the same seam; this is the
/// one a caller can reach while the process is already running.
static PANDOC_FOR_TESTS: Mutex<Option<String>> = Mutex::new(None);

/// Where pandoc was found, and how. A function of its arguments, so the search order can be tested
/// without a machine to test it on.
fn find_pandoc_from(
    from_env: Option<String>,
    known: &[PathBuf],
    path: Option<String>,
) -> (Option<PathBuf>, String) {
    if let Some(value) = from_env.filter(|value| !value.trim().is_empty()) {
        let named = PathBuf::from(value);
        // A name that is not there is an answer, not a fallback: a pandoc named and quietly not run
        // would not be the pandoc that was named. It is also how a probe asks the app for the
        // machine that has no pandoc at all (`test/probes/export-no-pandoc.js`).
        return if named.exists() {
            (Some(named), "env".to_string())
        } else {
            (None, "env-missing".to_string())
        };
    }
    for (index, candidate) in known.iter().enumerate() {
        if candidate.exists() {
            return (Some(candidate.clone()), format!("known-{index}"));
        }
    }
    // Only now the shell's `PATH`.
    if let Some(entries) = path {
        for entry in std::env::split_paths(&entries) {
            let candidate = entry.join("pandoc");
            if candidate.exists() {
                return (Some(candidate), "path".to_string());
            }
        }
    }
    (None, String::new())
}

pub fn find_pandoc() -> (Option<PathBuf>, String) {
    let named = PANDOC_FOR_TESTS.lock().ok().and_then(|named| named.clone());
    find_pandoc_from(
        named.or_else(|| std::env::var("YI_PANDOC").ok()),
        &known_pandoc_locations(),
        std::env::var("PATH").ok(),
    )
}

/// Points the app at another pandoc — `YI_PANDOC`, as a call, for a probe, which cannot change the
/// environment of the process it is driving. `None` puts the app back to looking for one.
///
/// Only a debug build is listenable: choosing the binary this app runs is a test's business, never
/// a shipped app's, so a release build answers with a refusal.
#[tauri::command]
pub fn export_use_pandoc(pandoc: Option<String>) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err("Only a debug build can be pointed at another pandoc.".to_string());
    }
    let mut named = PANDOC_FOR_TESTS
        .lock()
        .map_err(|_| "The pandoc seam is unusable.".to_string())?;
    *named = pandoc.filter(|value| !value.trim().is_empty());
    Ok(())
}

/// The kinds the dialog offers: what the app ships, and where each one's config file is.
#[tauri::command]
pub fn export_kinds(app: tauri::AppHandle) -> Result<ExportKinds, String> {
    let dir = export_dir(&app)?;
    let (pandoc, _source) = find_pandoc();
    let kinds = KINDS
        .iter()
        .map(|kind| {
            let path = dir.join(config_file_name(kind.kind));
            ExportKindInfo {
                kind: kind.kind.to_string(),
                extension: kind.extension.to_string(),
                needs_pandoc: kind.needs_pandoc,
                config_exists: path.exists(),
                config_path: path.to_string_lossy().into_owned(),
            }
        })
        .collect();
    Ok(ExportKinds {
        pandoc: pandoc.map(|found| found.to_string_lossy().into_owned()),
        kinds,
    })
}

/// Writes the note where pandoc reads files, and says where: a name of the app's own inside its
/// data folder, so nothing appears in the reader's own notes folder and no two exports collide.
fn write_note(dir: &Path, text: &str) -> Result<PathBuf, String> {
    let scratch = dir.join("tmp");
    fs::create_dir_all(&scratch)
        .map_err(|error| format!("Yi cannot make {}: {error}", scratch.display()))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or(0);
    let path = scratch.join(format!("note-{}-{stamp}.md", std::process::id()));
    fs::write(&path, text).map_err(|error| format!("Yi cannot write {}: {error}", path.display()))?;
    Ok(path)
}

/// Runs pandoc, and answers with *its* sentence when it fails: a missing bibliography, a bad key in
/// the defaults file and a destination that cannot be written each say something only pandoc knows.
fn run_pandoc(pandoc: &Path, arguments: &[OsString], working_dir: Option<&Path>) -> Result<(), String> {
    let mut command = Command::new(pandoc);
    if let Some(dir) = working_dir.filter(|dir| dir.is_dir()) {
        command.current_dir(dir);
    }
    let output = command
        .args(arguments)
        .output()
        .map_err(|error| format!("Could not run {}: {error}", pandoc.display()))?;
    if !output.status.success() {
        let complaint = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if complaint.is_empty() {
            format!("{} failed", pandoc.display())
        } else {
            complaint
        });
    }
    Ok(())
}

/// Exports the note, through pandoc and the kind's own defaults file.
#[tauri::command]
pub fn run_export(app: tauri::AppHandle, request: ExportRequest) -> Result<(), String> {
    let kind = kind_of(&request.kind)?;
    // Refused *before* anything is written: an export that cannot run should not leave a file of the
    // reader's text in the app's data folder.
    let pandoc = if kind.needs_pandoc {
        Some(
            find_pandoc()
                .0
                .ok_or_else(|| "This machine has no pandoc to run.".to_string())?,
        )
    } else {
        None
    };
    let dir = export_dir(&app)?;
    let defaults = ensure_defaults_in(&dir, kind)?;
    let note = write_note(&dir, &request.text)?;
    let result = pandoc_arguments(&dir, &defaults, &note, &request).and_then(|arguments| {
        match pandoc.as_deref() {
            // A kind that needs pandoc always has one here (`run_export` refuses first); the arms
            // are kept apart so the PDF tick, which will write its own file, has somewhere to go.
            Some(pandoc) => run_pandoc(
                pandoc,
                &arguments,
                request.source_dir.as_deref().map(Path::new),
            ),
            None => Err("This kind of export has nothing to run it with.".to_string()),
        }
    });
    // The note's copy under the app's data folder is a thing of this call, whatever pandoc said.
    let _ = fs::remove_file(&note);
    result
}

/// The whole of what the app asks pandoc for: the kind's own defaults file, the destination, the
/// folders a relative destination is resolved against, the library and the style the citations came
/// from, and the note itself.
fn pandoc_arguments(
    dir: &Path,
    defaults: &Path,
    note: &Path,
    request: &ExportRequest,
) -> Result<Vec<OsString>, String> {
    let mut arguments: Vec<OsString> = vec![
        OsString::from("--defaults"),
        defaults.as_os_str().to_os_string(),
        OsString::from("--output"),
        OsString::from(&request.output_path),
    ];
    if !request.resource_paths.is_empty() {
        let paths: Vec<PathBuf> = request.resource_paths.iter().map(PathBuf::from).collect();
        let joined = std::env::join_paths(&paths)
            .map_err(|error| format!("Yi cannot search {}: {error}", request.output_path))?;
        arguments.push(OsString::from("--resource-path"));
        arguments.push(joined);
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
    }
    if let Some(style) = &request.csl {
        arguments.push(OsString::from("--csl"));
        arguments.push(ensure_csl_in(dir, style)?.into_os_string());
    }
    arguments.push(note.as_os_str().to_os_string());
    Ok(arguments)
}

/// A kind's defaults file, written from the shipped one when it is not there yet, and where it is.
///
/// A *read* that keeps its own promise: the file a reader is about to edit has to exist, or the
/// button that reveals it would reveal nothing. Handing the path back rather than opening it is
/// what leaves the system's hand to the window: it is revealed in the folder it lives in, or
/// opened in whatever edits text, by the granted opener plugin
/// (`ui/export/export_dialog.ts: revealConfiguration`).
#[tauri::command]
pub fn export_config_path(app: tauri::AppHandle, kind: String) -> Result<String, String> {
    let kind = kind_of(&kind)?;
    let path = ensure_defaults_in(&export_dir(&app)?, kind)?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_kinds_config_file_is_named_for_the_kind() {
        assert_eq!(config_file_name("docx"), "export.docx.yaml");
    }

    #[test]
    fn a_kind_the_app_does_not_ship_is_refused_by_name() {
        let refused = kind_of("odt").expect_err("odt is not a kind this build ships");
        assert!(refused.contains("odt"), "{refused}");
        assert!(kind_of("docx").is_ok());
    }

    #[test]
    fn every_shipped_defaults_file_names_what_it_reads_and_writes() {
        // The asset is pandoc's own input, so the one thing worth holding it to is that it still
        // says which reader and writer it is for: a defaults file that lost its `writer` would
        // export the reader's note as pandoc's own default format, silently.
        for kind in KINDS {
            assert!(
                kind.defaults.contains("reader: markdown"),
                "{} defaults do not name markdown as the reader",
                kind.kind
            );
            let writer = kind
                .defaults
                .lines()
                .find_map(|line| line.strip_prefix("writer: "))
                .map(str::trim)
                .unwrap_or("");
            assert_eq!(writer, kind.extension, "{} defaults", kind.kind);
        }
    }

    #[test]
    fn the_defaults_file_is_written_once_and_an_edited_one_is_kept() {
        let dir = std::env::temp_dir().join(format!("yi-export-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let kind = &KINDS[0];

        let written = ensure_defaults_in(&dir, kind).unwrap();
        assert_eq!(written, dir.join("export.docx.yaml"));
        assert_eq!(fs::read_to_string(&written).unwrap(), kind.defaults);

        fs::write(&written, "# edited\n").unwrap();
        let again = ensure_defaults_in(&dir, kind).unwrap();
        assert_eq!(again, written);
        assert_eq!(fs::read_to_string(&written).unwrap(), "# edited\n");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_pandoc_named_by_the_test_seam_is_the_one_that_is_run() {
        let here = std::env::current_exe().unwrap();
        let (found, source) = find_pandoc_from(
            Some(here.to_string_lossy().into_owned()),
            &[],
            Some("/nowhere".to_string()),
        );
        assert_eq!(found.as_deref(), Some(here.as_path()));
        assert_eq!(source, "env");
    }

    #[test]
    fn a_named_pandoc_that_is_not_there_means_no_pandoc_at_all() {
        // Not a fallback to a found one: a probe asks for the machine that has none this way.
        let (found, source) = find_pandoc_from(
            Some("/definitely/not/pandoc".to_string()),
            &[std::env::current_exe().unwrap()],
            Some("/bin".to_string()),
        );
        assert!(found.is_none());
        assert_eq!(source, "env-missing");
    }

    #[test]
    fn a_known_place_is_searched_before_the_shells_path() {
        let known = std::env::current_exe().unwrap();
        let (found, source) = find_pandoc_from(None, &[known.clone()], Some("/bin".to_string()));
        assert_eq!(found, Some(known));
        assert_eq!(source, "known-0");
    }

    #[test]
    fn and_a_machine_with_neither_answers_nothing() {
        let (found, source) = find_pandoc_from(None, &[], Some("/nowhere".to_string()));
        assert!(found.is_none());
        assert!(source.is_empty());
    }

    /// A request for the tests that read the arguments: every name it can carry, carried.
    fn request_in(dir: &Path) -> ExportRequest {
        ExportRequest {
            kind: "docx".to_string(),
            text: "# a note\n".to_string(),
            output_path: dir.join("out.docx").to_string_lossy().into_owned(),
            resource_paths: vec![dir.to_string_lossy().into_owned()],
            source_dir: None,
            bibliography: Some(dir.join("library.bib").to_string_lossy().into_owned()),
            csl: Some(CslStyle {
                name: "apa".to_string(),
                xml: "<style>apa</style>".to_string(),
            }),
            references: Some("References".to_string()),
        }
    }

    fn named_arguments(dir: &Path, request: &ExportRequest) -> Vec<String> {
        pandoc_arguments(dir, &dir.join("export.docx.yaml"), &dir.join("note-1.md"), request)
            .unwrap()
            .iter()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect()
    }

    /// A folder of this test's own, made and taken away again.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yi-export-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_arguments_are_the_whole_of_what_the_app_asks_pandoc_for() {
        let dir = scratch("arguments");
        fs::write(dir.join("library.bib"), "@article{smith2020}\n").unwrap();
        let request = request_in(&dir);

        assert_eq!(
            named_arguments(&dir, &request),
            vec![
                "--defaults".to_string(),
                dir.join("export.docx.yaml").to_string_lossy().into_owned(),
                "--output".to_string(),
                request.output_path.clone(),
                "--resource-path".to_string(),
                dir.to_string_lossy().into_owned(),
                "--bibliography".to_string(),
                dir.join("library.bib").to_string_lossy().into_owned(),
                "--metadata".to_string(),
                "reference-section-title=References".to_string(),
                "--csl".to_string(),
                dir.join("styles/apa.csl").to_string_lossy().into_owned(),
                dir.join("note-1.md").to_string_lossy().into_owned(),
            ]
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_library_that_is_not_there_is_not_named_at_all() {
        // Pandoc exits non-zero on a bibliography it cannot read, which would lose the whole export
        // over a setting that names a file the reader has since moved.
        let dir = scratch("no-library");
        fs::write(dir.join("library.bib"), "@article{smith2020}\n").unwrap();
        let mut request = request_in(&dir);
        assert!(named_arguments(&dir, &request).contains(&"--bibliography".to_string()));

        request.bibliography = Some(dir.join("gone.bib").to_string_lossy().into_owned());
        assert!(!named_arguments(&dir, &request).contains(&"--bibliography".to_string()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_style_at_all_is_no_style_argument() {
        let dir = scratch("no-style");
        let mut request = request_in(&dir);
        request.csl = None;
        assert!(!named_arguments(&dir, &request).contains(&"--csl".to_string()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_style_lands_in_a_file_named_for_the_style_and_nowhere_else() {
        assert_eq!(style_file_name("apa"), "apa");
        assert_eq!(style_file_name("harvard1"), "harvard1");
        // A config value a reader may type anything into: what it cannot do is name a file outside
        // the folder its styles are kept in, or a hidden one.
        for dangerous in ["../../evil", "/etc/passwd", "..", ".hidden", "", "  "] {
            let name = style_file_name(dangerous);
            assert!(
                !name.contains('/') && !name.contains('\\') && name != ".." && !name.starts_with('.'),
                "{dangerous} became {name}"
            );
        }
    }

    #[test]
    fn the_style_is_written_once_and_replaced_when_the_style_changes() {
        let dir = scratch("csl");
        let mut style = CslStyle {
            name: "apa".to_string(),
            xml: "<style>one</style>".to_string(),
        };

        let written = ensure_csl_in(&dir, &style).unwrap();
        assert_eq!(written, dir.join("styles/apa.csl"));
        assert_eq!(fs::read_to_string(&written).unwrap(), "<style>one</style>");

        style.xml = "<style>two</style>".to_string();
        assert_eq!(ensure_csl_in(&dir, &style).unwrap(), written);
        assert_eq!(fs::read_to_string(&written).unwrap(), "<style>two</style>");

        let _ = fs::remove_dir_all(&dir);
    }
}
