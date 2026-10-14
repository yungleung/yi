//! Turning the note on screen into a file another program can read.
//!
//! The conversion is pandoc's, and so are its parameters: a kind of export is a YAML *defaults file*
//! in the app's data folder (`<data>/export/export.<kind>.yaml`), written there from the copy this
//! build ships the first time that kind is used, and handed to pandoc as `--defaults`. Nothing here
//! parses it — what it says is pandoc's business, and a key it does not know is answered by pandoc's
//! own complaint. A file that is already there is never overwritten, so an edit stands.
//!
//! One kind is **not** pandoc's: `markdown`, whose conversion *is* the pre-process every kind shares
//! (`ui/export/preprocess.ts`) — the app writes the text it prepared ([`export_own_text`]). It is the
//! kind the row's `needs_pandoc: false` says so, and the card offers no settings file for it because
//! there is none.
//!
//! What *is* the app's business:
//!
//! - **which kinds exist** ([`KINDS`]): one row per kind — the name, the extension its output is
//!   written under, whether pandoc writes it, and the defaults file's bytes, compiled in. A kind is
//!   added by adding a row and its asset; nothing else in the app lists kinds.
//! - **which pandoc may be run** ([`find_pandoc`]): never `PATH` alone, because an app started from
//!   Finder inherits no shell's `PATH` — the known places are searched first, and `YI_PANDOC`, or
//!   [`export_use_pandoc`] for a probe (which cannot change the environment of the app it drives),
//!   comes before both. A name that is not there means *no pandoc*, never a different one.
//! - **the note handed over**: the text is written to a file under the app's data folder, because
//!   pandoc reads files, and that file is deleted again whether pandoc succeeded or not.
//! - **a picture the note names on the web**: fetched by the app, not by pandoc, and handed over as
//!   a local file ([`export_fetch_image`]). Pandoc downloads remote images only when it was built
//!   with HTTP support, and the pandoc this app finds may not have been — measured: the one on the
//!   machine this was written on answers *"pandoc was compiled without HTTP support"* and puts the
//!   picture's description in the document instead. The app can see the picture, so it is the app's
//!   job to hand it over. The download goes through [`run_curl`] — one list in one place, held by a
//!   probe against a curl that only records, like the git and pandoc ones.
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
    /// What the output's name is made of: the note's own name, plus this. Empty for every kind
    /// whose output is a *different* file from the note — and `.processed` for the one kind whose
    /// extension is markdown's own, because the default target is the note's folder and the note's
    /// name: an export that writes over the document it is exporting is not one anybody means.
    pub name_suffix: &'static str,
    /// Whether the conversion is pandoc's at all. `markdown` says **no**: its conversion *is* the
    /// pre-process every kind shares (`ui/export/preprocess.ts`) — a wikilink written as the words it
    /// renders as, a citation as the words *it* reads as with the works it names listed under them —
    /// so the app writes that text out itself ([`export_own_text`]) and there is no pandoc to hand a
    /// defaults file to.
    pub needs_pandoc: bool,
    /// Whether the kind draws its **own name** from the note rather than saying it in its body: a
    /// book's title page and its `<dc:title>`, a page's `<title>`.
    ///
    /// The kinds that write the title as *body* content (docx, odt, latex) say no, and that is
    /// measured: given a title in the metadata, a docx of a note that opens with its own `#` heading
    /// says that name **twice** — a Title paragraph and then the heading — and an odt the same.
    pub takes_a_title: bool,
    /// Whether the kind must declare a **language** of its own. An EPUB must: `dc:language` is
    /// required of one, and pandoc otherwise writes the machine locale's `C` — which is not a
    /// language tag at all. The others either say their language in their own way or have none to
    /// give, and `lang` in a LaTeX run pulls in a hyphenation package chosen by language, which is
    /// not something to do unasked.
    pub needs_a_language: bool,
    /// The defaults file this build ships, as its own bytes: what a reader's copy starts as.
    pub defaults: &'static str,
}

/// Every kind of export this build ships, in the order the dialog shows them.
pub const KINDS: &[ExportKind] = &[
    ExportKind {
        kind: "docx",
        extension: "docx",
        name_suffix: "",
        takes_a_title: false,
        needs_a_language: false,
        // Zettlr's own defaults, less one key (see the file's header): the shape a reader who knows
        // that app already knows, and a set of pandoc parameters worth respecting.
        needs_pandoc: true,
        defaults: include_str!("../assets/export/export.docx.yaml"),
    },
    ExportKind {
        kind: "odt",
        extension: "odt",
        name_suffix: "",
        takes_a_title: false,
        needs_a_language: false,
        needs_pandoc: true,
        defaults: include_str!("../assets/export/export.odt.yaml"),
    },
    ExportKind {
        kind: "latex",
        // The one kind whose output is *not* named after its writer: pandoc's `latex` writer writes
        // a `.tex`, and `every_shipped_kind...` below is where those two facts are held together.
        extension: "tex",
        name_suffix: "",
        takes_a_title: false,
        needs_a_language: false,
        needs_pandoc: true,
        defaults: include_str!("../assets/export/export.latex.yaml"),
    },
    ExportKind {
        kind: "html",
        extension: "html",
        name_suffix: "",
        // The page's `<title>` is the reader's tab, not a line of the document: nothing in the body
        // says it, so it comes from the note.
        takes_a_title: true,
        needs_a_language: false,
        needs_pandoc: true,
        defaults: include_str!("../assets/export/export.html.yaml"),
    },
    ExportKind {
        kind: "epub",
        extension: "epub",
        name_suffix: "",
        // A book has a title page and a required `<dc:title>`, and a required `<dc:language>`
        // (measured: without one pandoc writes `C`, and the title page reads UNTITLED).
        takes_a_title: true,
        needs_a_language: true,
        needs_pandoc: true,
        defaults: include_str!("../assets/export/export.epub.yaml"),
    },
    ExportKind {
        kind: "pdf",
        extension: "pdf",
        name_suffix: "",
        // The TeX engine the reader's config names does the work (their defaults file says
        // `xelatex`): this is the kind that needs a TeX suite on the machine, and the one whose
        // defaults file is worth editing for a page size. It is also the one kind whose *engine*
        // draws its page with the font the file names, which is where a reader whose note is not
        // written in Latin adds one (`variables: CJKmainfont`, or `mainfont` for any script).
        takes_a_title: false,
        needs_a_language: false,
        needs_pandoc: true,
        defaults: include_str!("../assets/export/export.pdf.yaml"),
    },
    ExportKind {
        kind: "markdown",
        extension: "md",
        // Not the note's own name: `note.md` beside `note.md` is the note.
        name_suffix: ".processed",
        takes_a_title: false,
        needs_a_language: false,
        // No defaults file at all: there is no pandoc left to hand one to, and a file made of nothing
        // would be a file a reader could edit with no effect.
        needs_pandoc: false,
        defaults: "",
    },
];

/// A kind of export as the window reads it: its own facts, and where its config file lives.
#[derive(Debug, Serialize, Clone)]
pub struct ExportKindInfo {
    pub kind: String,
    pub extension: String,
    /// What the output's name adds to the note's own (`note.processed.md` for the one kind whose
    /// extension is markdown's own).
    pub name_suffix: String,
    /// Whether pandoc writes this kind. A kind that says no is written by the app itself, so it has
    /// no defaults file to name and no pandoc to run — the card says so instead of offering either.
    pub needs_pandoc: bool,
    /// Whether the window should hand this kind the note's own name, and a language.
    pub takes_a_title: bool,
    pub needs_a_language: bool,
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
    /// The language the note is written in, as the app knows it: the frontmatter's `lang:`, else the
    /// language the app is speaking. Used by the kinds that must declare one (`needs_a_language`).
    #[serde(default)]
    pub language: Option<String>,
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

/// The known places a curl lives on a Mac. It is a system tool: `/usr/bin/curl` is there on every
/// machine this app runs on, and no other path is worth guessing at.
fn known_curl_locations() -> Vec<PathBuf> {
    vec![
        PathBuf::from("/usr/bin/curl"),
        PathBuf::from("/opt/homebrew/bin/curl"),
    ]
}

/// The pandoc a probe has pointed the app at, if it has. `YI_PANDOC` is the same seam; this is the
/// one a caller can reach while the process is already running.
static PANDOC_FOR_TESTS: Mutex<Option<String>> = Mutex::new(None);

/// The curl a probe has pointed the app at, if it has — `YI_CURL` and [`export_use_curl`], the same
/// pair the pandoc seam has.
static CURL_FOR_TESTS: Mutex<Option<String>> = Mutex::new(None);

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

pub fn find_curl() -> (Option<PathBuf>, String) {
    let named = CURL_FOR_TESTS.lock().ok().and_then(|named| named.clone());
    find_pandoc_from(
        named.or_else(|| std::env::var("YI_CURL").ok()),
        &known_curl_locations(),
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

/// Points the app at another curl — `YI_CURL`, as a call, for a probe. `None` puts it back.
#[tauri::command]
pub fn export_use_curl(curl: Option<String>) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err("Only a debug build can be pointed at another curl.".to_string());
    }
    let mut named = CURL_FOR_TESTS
        .lock()
        .map_err(|_| "The curl seam is unusable.".to_string())?;
    *named = curl.filter(|value| !value.trim().is_empty());
    Ok(())
}

/// The kinds the dialog offers: what the app ships, and where each one's config file is.
#[tauri::command]
pub fn export_kinds(app: tauri::AppHandle) -> Result<ExportKinds, String> {
    let dir = export_dir(&app)?;
    let (pandoc, _source) = find_pandoc();
    let kinds = KINDS.iter().map(|kind| kind_info(&dir, kind)).collect();
    Ok(ExportKinds {
        pandoc: pandoc.map(|found| found.to_string_lossy().into_owned()),
        kinds,
    })
}

/// One kind as the window reads it: the facts off its row, and where the reader's own copy of its
/// defaults file is — there whether or not it exists yet, and *no path at all* for the kind the app
/// writes itself, which has no file to name or reveal.
fn kind_info(dir: &Path, kind: &ExportKind) -> ExportKindInfo {
    let config = kind
        .needs_pandoc
        .then(|| dir.join(config_file_name(kind.kind)));
    ExportKindInfo {
        kind: kind.kind.to_string(),
        extension: kind.extension.to_string(),
        name_suffix: kind.name_suffix.to_string(),
        needs_pandoc: kind.needs_pandoc,
        takes_a_title: kind.takes_a_title,
        needs_a_language: kind.needs_a_language,
        config_exists: config.as_deref().is_some_and(Path::exists),
        config_path: config
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default(),
    }
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
///
/// What it says on the way *without* failing is kept too — a picture it could not fetch, a citation
/// it could not resolve: those are the reasons a document is not quite what the reader asked for,
/// and the window says them rather than leaving the reader to notice the hole.
fn run_pandoc(
    pandoc: &Path,
    arguments: &[OsString],
    working_dir: Option<&Path>,
) -> Result<Vec<String>, String> {
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
    Ok(warnings_in(&String::from_utf8_lossy(&output.stderr)))
}

/// The lines pandoc wrote that are not blank: its warnings, one sentence each.
fn warnings_in(stderr: &str) -> Vec<String> {
    stderr
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        // Pandoc decorates each warning with `[WARNING]` for a log's sake; the reader is looking at
        // a card that *is* the warning, so the decoration comes off.
        .map(|line| line.strip_prefix("[WARNING] ").unwrap_or(line).to_string())
        .collect()
}

/// Where a run's own files live: the note written for pandoc, and the pictures fetched for it.
fn tmp_dir(dir: &Path) -> PathBuf {
    dir.join("tmp")
}

/// Where a run's fetched pictures live. One folder, emptied when a run is over: they are that run's
/// files and nothing else's, and a note's picture is re-fetched rather than remembered, because the
/// web page it came from may have changed since.
fn remote_dir(dir: &Path) -> PathBuf {
    tmp_dir(dir).join("remote")
}

/// The extension a picture's own content type has — for the types a Word file can hold, and for
/// nothing else. A file named wrongly is a picture Word will not draw, and a page that answered
/// instead of a picture is not a picture at all.
fn image_extension(content_type: &str) -> Option<&'static str> {
    match content_type.split(';').next().unwrap_or("").trim() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/bmp" => Some("bmp"),
        "image/tiff" => Some("tiff"),
        _ => None,
    }
}

/// A hash of a URL, so one URL is one file however many times a note names it. FNV-1a: what a name
/// needs is that no two URLs of one note share it, not a cryptographic digest.
fn url_hash(url: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in url.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// What a fetched picture is called: the last piece of the URL's own path, filtered the way a
/// style's name is, and the URL's hash — so a name that came from the web can only ever name a file
/// inside the folder it is put in.
fn remote_file_name(url: &str) -> String {
    let tail = url
        .split(['?', '#'])
        .next()
        .unwrap_or(url)
        .rsplit('/')
        .find(|piece| !piece.is_empty())
        .unwrap_or("picture");
    let stem: String = tail
        .split('.')
        .next()
        .unwrap_or("")
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
        })
        .take(40)
        .collect();
    let stem = if stem.is_empty() { "picture" } else { stem.as_str() };
    format!("{stem}-{:016x}", url_hash(url))
}

/// The whole of what the app asks curl to do: fetch one URL into one file, following redirects,
/// refusing a status that is not a document, answering what the server called the thing it sent, and
/// giving up rather than hanging — and nothing else. No upload, no credentials, no cookie jar.
///
/// Every curl call the app makes goes through here, so that list is one list in one place — the list
/// `test/probes/export-web-image.js` holds to with a curl that only records.
fn run_curl(curl: &Path, dir: &Path, url: &str, path: &Path) -> Result<String, String> {
    let output = Command::new(curl)
        .current_dir(dir)
        .arg("--fail")
        .arg("--silent")
        .arg("--show-error")
        .arg("--location")
        .arg("--max-time")
        .arg("30")
        .arg("--output")
        .arg(path)
        .arg("--write-out")
        .arg("%{content_type}")
        .arg("--")
        .arg(url)
        .output()
        .map_err(|error| format!("Could not run {}: {error}", curl.display()))?;
    if !output.status.success() {
        let complaint = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if complaint.is_empty() {
            format!("{url} could not be fetched")
        } else {
            complaint
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// One picture from the web, downloaded into a run's own folder, and where it landed.
fn download_image(curl: &Path, dir: &Path, url: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(dir).map_err(|error| format!("Yi cannot make {}: {error}", dir.display()))?;
    let name = remote_file_name(url);
    // The name carries the picture's type, and the type is only known once the server has answered —
    // so it is fetched under a name of its own first and named properly afterwards.
    let partial = dir.join(format!("{name}.download"));
    // One retry, because a fetch that fails once is far likelier to be a network that blinked than a
    // picture that is not there — and measured the other way round: a run whose fetch failed left a
    // book holding the picture's *description*, with the only word about it coming from pandoc, which
    // blamed itself ("compiled without HTTP support") for a failure that was the app's. The second
    // failure is the answer.
    let content_type = match run_curl(curl, dir, url, &partial) {
        Ok(content_type) => content_type,
        Err(first) => {
            std::thread::sleep(std::time::Duration::from_millis(250));
            run_curl(curl, dir, url, &partial).map_err(|_| first)?
        }
    };
    let extension = match image_extension(&content_type) {
        Some(extension) => extension,
        None => {
            let _ = fs::remove_file(&partial);
            return Err(format!(
                "{url} is {}, and a Word file cannot hold that.",
                if content_type.is_empty() {
                    "of no type this app knows".to_string()
                } else {
                    content_type
                }
            ));
        }
    };
    let path = dir.join(format!("{name}.{extension}"));
    fs::rename(&partial, &path)
        .map_err(|error| format!("Yi cannot name {}: {error}", path.display()))?;
    Ok(path)
}

/// A picture the note names on the web, handed over as a local file for pandoc to embed.
///
/// The app fetches it because pandoc may not be able to: a pandoc built without HTTP support answers
/// *"Could not fetch resource …"* and puts the picture's description in the document, which is the
/// hole this fills. A URL that cannot be fetched, or that is not a picture a Word file can hold, is
/// an error here and the window leaves the destination exactly as the note wrote it — pandoc's own
/// warning about it reaches the reader either way (`ExportOutcome.warnings`).
#[tauri::command]
pub fn export_fetch_image(app: tauri::AppHandle, url: String) -> Result<String, String> {
    let curl = find_curl()
        .0
        .ok_or_else(|| "This machine has no curl to fetch it with.".to_string())?;
    let path = download_image(&curl, &remote_dir(&export_dir(&app)?), &url)?;
    Ok(path.to_string_lossy().into_owned())
}

/// Exports the note: the kind the reader chose, in pandoc's own hands.
#[tauri::command]
pub fn run_export(app: tauri::AppHandle, request: ExportRequest) -> Result<ExportOutcome, String> {
    let kind = kind_of(&request.kind)?;
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
        .map_err(|error| format!("Yi could not write {}: {error}", request.output_path))?;
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
        .ok_or_else(|| "This machine has no pandoc to run.".to_string())?;
    let dir = export_dir(app)?;
    let defaults = ensure_defaults_in(&dir, kind)?;
    let note = write_note(&dir, &request.text)?;
    let result = pandoc_arguments(&dir, &defaults, &note, request, kind).and_then(|arguments| {
        run_pandoc(
            &pandoc,
            &arguments,
            request.source_dir.as_deref().map(Path::new),
        )
        .map(|warnings| ExportOutcome { warnings })
    });
    // The note's copy under the app's data folder is a thing of this call, whatever pandoc said —
    // and so are the pictures fetched for it. A picture is re-fetched rather than remembered: the
    // page it came from may have changed since the last export.
    let _ = fs::remove_file(&note);
    let _ = fs::remove_dir_all(remote_dir(&dir));
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
    kind: &ExportKind,
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
    if !kind.needs_pandoc {
        // A kind whose conversion is the app's own has no configuration to read — and a file made of
        // nothing would be a file a reader could edit with no effect.
        return Err(format!("Yi has no configuration file for {}.", kind.kind));
    }
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
        // `rtf` is the writer this test is written against: one no kind of ours will ever be, so the
        // list below is the thing that ages — and adding a kind makes this test say so (it has, three
        // times: `odt`, `latex`, `html`, each one moved the example along).
        let refused = kind_of("rtf").expect_err("rtf is not a kind this build ships");
        assert!(refused.contains("rtf"), "{refused}");
        for shipped in ["docx", "odt", "latex", "html", "epub"] {
            assert!(kind_of(shipped).is_ok(), "{shipped} is not shipped");
        }
    }

    #[test]
    fn every_shipped_kind_names_the_reader_and_writer_pandoc_is_given_and_the_file_that_comes_out() {
        // The asset is pandoc's own input, so the one thing worth holding it to is that it still
        // says which reader and writer it is for: a defaults file that lost its `writer` would
        // export the reader's note as pandoc's own default format, silently.
        //
        // The *extension* is the app's own fact and cannot be read off the file — `latex` writes a
        // `.tex`, and docx and odt happen to be named after their writers — so pandoc's names are
        // written down once, here, which is what keeps a row and its asset from drifting apart.
        let produced_by = |writer: &str| match writer {
            "docx" => "docx",
            "odt" => "odt",
            "latex" => "tex",
            "html" => "html",
            "epub" => "epub",
            "pdf" => "pdf",
            "markdown" => "md",
            _ => "",
        };
        // The `markdown` kind ships none at all: its conversion is the app's own, which
        // `the_kind_pandoc_does_not_write_is_the_kind_with_no_defaults_file` holds the other way.
        for kind in KINDS.iter().filter(|kind| !kind.defaults.is_empty()) {
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
            assert_eq!(writer, kind.kind, "{} defaults name another writer", kind.kind);
            assert_eq!(
                produced_by(writer),
                kind.extension,
                "{} is written under the wrong extension",
                kind.kind
            );
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
            title: Some("Going out".to_string()),
            language: Some("en-GB".to_string()),
        }
    }

    fn named_arguments(dir: &Path, request: &ExportRequest) -> Vec<String> {
        named_arguments_for(dir, request, kind_of(&request.kind).unwrap())
    }

    fn named_arguments_for(dir: &Path, request: &ExportRequest, kind: &ExportKind) -> Vec<String> {
        pandoc_arguments(
            dir,
            &dir.join(config_file_name(kind.kind)),
            &dir.join("note-1.md"),
            request,
            kind,
        )
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
    fn only_a_kind_that_carries_its_own_name_is_told_what_the_note_is_called() {
        // The window hands over the note's title and language whatever kind it is exporting, and the
        // *kind* decides: a book and a web page need them (a title page, a `<dc:title>`, a required
        // `dc:language`), while a docx whose body already opens with the note's own heading would say
        // that name twice — measured, with a title in the metadata, the docx and the odt each said
        // it twice — and a `lang` in a LaTeX run picks a hyphenation package by language.
        let dir = scratch("names");
        let request = request_in(&dir);

        let docx = named_arguments(&dir, &request);
        assert!(!docx.iter().any(|argument| argument.starts_with("title=")), "{docx:?}");
        assert!(!docx.iter().any(|argument| argument.starts_with("lang=")), "{docx:?}");

        let epub = named_arguments_for(&dir, &request, kind_of("epub").unwrap());
        assert!(epub.contains(&"--metadata".to_string()), "{epub:?}");
        assert!(epub.contains(&"title=Going out".to_string()), "{epub:?}");
        assert!(epub.contains(&"lang=en-GB".to_string()), "{epub:?}");

        // A page's own name, but no language to declare.
        let html = named_arguments_for(&dir, &request, kind_of("html").unwrap());
        assert!(html.contains(&"title=Going out".to_string()), "{html:?}");
        assert!(!html.iter().any(|argument| argument.starts_with("lang=")), "{html:?}");

        // And a note the app knows nothing about says nothing: no empty `title=`.
        let mut silent = request_in(&dir);
        silent.title = None;
        silent.language = Some("   ".to_string());
        let epub = named_arguments_for(&dir, &silent, kind_of("epub").unwrap());
        assert!(!epub.iter().any(|argument| argument.starts_with("title=")), "{epub:?}");
        assert!(!epub.iter().any(|argument| argument.starts_with("lang=")), "{epub:?}");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_kind_whose_output_would_be_the_note_itself_names_it_otherwise() {
        // The one row whose extension is markdown's own: its target is the note's own folder and the
        // note's own name, so without this the export would write over the document it is exporting.
        assert_eq!(kind_of("markdown").unwrap().name_suffix, ".processed");
        assert_eq!(kind_of("pdf").unwrap().name_suffix, "");
    }

    #[test]
    fn the_kind_pandoc_does_not_write_is_the_kind_with_no_defaults_file() {
        // One fact, one home: a row that says the app writes this kind says it by having nothing to
        // hand pandoc, and a row pandoc writes always has something. A kind added with one and not
        // the other says so here.
        for kind in KINDS {
            assert_eq!(
                kind.defaults.is_empty(),
                !kind.needs_pandoc,
                "{} says pandoc writes it while shipping no defaults file, or the other way round",
                kind.kind
            );
        }
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

    #[test]
    fn a_picture_is_named_for_its_own_type_and_never_for_a_path() {
        assert_eq!(image_extension("image/png"), Some("png"));
        assert_eq!(image_extension("image/jpeg"), Some("jpg"));
        assert_eq!(image_extension("IMAGE/GIF"), None); // curl reports lower case; anything else is
        assert_eq!(image_extension("image/png; charset=binary"), Some("png"));
        assert_eq!(image_extension("image/svg+xml"), None);
        assert_eq!(image_extension("text/html"), None);
        assert_eq!(image_extension(""), None);
    }

    #[test]
    fn a_fetched_picture_can_only_name_a_file_below_its_own_folder() {
        for url in [
            "https://placehold.co/200x80/png",
            "https://example.com/a/b/pic.png?token=1#frag",
            "https://example.com/../../etc/passwd",
            "https://example.com/",
        ] {
            let name = remote_file_name(url);
            assert!(
                !name.contains('/') && !name.contains('\\') && !name.starts_with('.'),
                "{url} became {name}"
            );
        }
        // One URL is one file, so a note that names a picture twenty times fetches it once.
        assert_eq!(
            remote_file_name("https://example.com/pic.png"),
            remote_file_name("https://example.com/pic.png")
        );
        assert_ne!(
            remote_file_name("https://example.com/pic.png"),
            remote_file_name("https://example.com/other.png")
        );
    }

    #[test]
    fn what_pandoc_says_on_the_way_is_kept_line_by_line() {
        let stderr = "[WARNING] Could not fetch resource https://x/y.png: no\n\n\
             [WARNING] Citeproc: citation smith2020 not found\n";
        assert_eq!(
            warnings_in(stderr),
            vec![
                "Could not fetch resource https://x/y.png: no".to_string(),
                "Citeproc: citation smith2020 not found".to_string(),
            ]
        );
        assert!(warnings_in("").is_empty());
    }

    #[test]
    fn a_curl_named_by_the_test_seam_is_the_one_that_is_run() {
        let here = std::env::current_exe().unwrap();
        let (found, source) = find_pandoc_from(
            Some(here.to_string_lossy().into_owned()),
            &[],
            Some("/nowhere".to_string()),
        );
        assert_eq!(found, Some(here));
        assert_eq!(source, "env");
    }
}
