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
//!   job to hand it over. An SVG or a webp is kept as itself here and then carried or drawn by the
//!   kind (`ui/export/export_flow.ts`). The download goes through [`run_curl`] — one list in one
//!   place, held by a probe against a curl that only records, like the git and pandoc ones.
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
    /// Whether this kind's output is **typeset with fonts the settings file names**: the PDF, whose
    /// page XeTeX draws, and the LaTeX document, which the reader compiles with their own engine.
    ///
    /// It is what the card's font hint keys off, and nothing else is: a note written in a script no
    /// font in that file can draw is a page — or a `.tex` — with the words' places kept and the words
    /// gone (measured), while a docx, a page of HTML or a book carries the characters as characters
    /// and whatever opens it picks a font of its own.
    pub needs_a_font: bool,
    /// Whether this kind's page is drawn **by a font this build ships**, wired into the export by a
    /// header of its own (`fonts::bundled`): the PDF, and only the PDF.
    ///
    /// A note in a script no font on the machine draws comes out with the space its words took and
    /// none of the words (measured), and naming a font is the reader's line to write — which is still
    /// there to write. What this buys is that ten scripts draw with no line added at all. The LaTeX
    /// kind says no: it is a `.tex` the reader compiles on their own machine, where a path into this
    /// app's bundle is a path that will not exist.
    pub ships_fonts: bool,
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
    /// Whether what the kind is handed is a body of the window's making rather than the note's own
    /// text: a **book keeps the note's own level-1 heading**, the note's name standing in it when the
    /// note writes none (`ui/export/book_body.ts`).
    ///
    /// A note may keep that heading in its frontmatter `title:` — and pandoc's EPUB writer then makes
    /// a heading of its own, level 1, out of the book's name and nests the note inside it, *outside* the
    /// document pandoc makes identifiers unique in: measured, a note whose `## Going out` repeats the name came
    /// out with `Duplicate ID "going-out"` twice (`check-epub-valid.mjs`). Writing the name into the
    /// note's copy is what puts the two in one id-space. Every other kind's body is the note's own
    /// text, and a docx or an odt that opened with a heading of that name would say it twice.
    pub names_its_body: bool,
    /// Whether this kind's output can hold a **picture as it is** — an SVG or a webp: a page of HTML and
    /// a book can (SVG and webp are both EPUB core media types, and a book of one validates clean), and
    /// the app's own hand leaves the note's destinations as written; a Word file, an OpenDocument file, a
    /// page XeTeX lays out and the `.tex` that page is compiled from cannot — measured, a docx gets a
    /// converted PNG beside the raw `.svg` where the machine has a rasteriser, the raw vector alone where
    /// it has none, and a webp carried in as a file none of the five types promises. What the app does for
    /// those kinds is draw the PNG itself and hand that over (`ui/export/raster_picture.ts`).
    pub carries_pictures: bool,
    /// Whether the card may tell this kind **what page to lay out**, in a size and an orientation: the
    /// PDF, whose page XeTeX draws. Every other kind's page is the reader's own to set in the defaults
    /// file, or is not a page at all — a docx, a book or a web page carries the text and relies on
    /// whatever shows it.
    pub takes_a_page_size: bool,
    /// The defaults file this build ships, as its own bytes: what a reader's copy starts as.
    pub defaults: &'static str,
}

/// One page size as the card offers it: the words on it, and the `geometry` option behind them.
#[derive(Debug, Serialize, Clone)]
pub struct PaperSize {
    /// What a reader reads: `A4`, `B0 JIS`, `Letter`.
    pub label: String,
    /// The option that means it, which is what travels back and is passed to pandoc.
    pub value: String,
}

/// The page sizes a reader may choose — the list the pdf defaults file's own comment carries, which is
/// `geometry`'s own: the ISO A, B and C series, JIS B (the one without `paper` after it), letter,
/// executive and legal.
///
/// A size reaches the page as a `geometry` option and **not** as a `papersize` variable, and that is
/// measured: a `papersize` on the command line is *concatenated* with the one the reader's file sets —
/// `a4letterpaper`, a LaTeX warning about an unused global option, and a letter page by luck — while
/// geometry's options are appended after the file's own and take the page with them (measured: a file
/// saying `papersize: a4` plus `geometry=letterpaper` gives letter, `geometry=landscape` gives A4
/// landscape, and `geometry=portrait` over a file saying `geometry: landscape` gives portrait).
pub const PAPER_SIZES: &[(&str, &str)] = &[
    ("A0", "a0paper"),
    ("A1", "a1paper"),
    ("A2", "a2paper"),
    ("A3", "a3paper"),
    ("A4", "a4paper"),
    ("A5", "a5paper"),
    ("A6", "a6paper"),
    ("B0", "b0paper"),
    ("B1", "b1paper"),
    ("B2", "b2paper"),
    ("B3", "b3paper"),
    ("B4", "b4paper"),
    ("B5", "b5paper"),
    ("B6", "b6paper"),
    ("C0", "c0paper"),
    ("C1", "c1paper"),
    ("C2", "c2paper"),
    ("C3", "c3paper"),
    ("C4", "c4paper"),
    ("C5", "c5paper"),
    ("C6", "c6paper"),
    ("B0 JIS", "b0j"),
    ("Letter", "letterpaper"),
    ("Executive", "executivepaper"),
    ("Legal", "legalpaper"),
];

/// Every kind of export this build ships, in the order the dialog shows them.
pub const KINDS: &[ExportKind] = &[
    ExportKind {
        kind: "docx",
        extension: "docx",
        name_suffix: "",
        takes_a_title: false,
        needs_a_language: false,
        names_its_body: false,
        carries_pictures: false,
        takes_a_page_size: false,
        // Zettlr's own defaults, less one key (see the file's header): the shape a reader who knows
        // that app already knows, and a set of pandoc parameters worth respecting.
        needs_pandoc: true,
        needs_a_font: false,
        defaults: include_str!("../assets/export/export.docx.yaml"),
        ships_fonts: false,
    },
    ExportKind {
        kind: "odt",
        extension: "odt",
        name_suffix: "",
        takes_a_title: false,
        needs_a_language: false,
        names_its_body: false,
        carries_pictures: false,
        takes_a_page_size: false,
        needs_pandoc: true,
        needs_a_font: false,
        defaults: include_str!("../assets/export/export.odt.yaml"),
        ships_fonts: false,
    },
    ExportKind {
        kind: "latex",
        // The one kind whose output is *not* named after its writer: pandoc's `latex` writer writes
        // a `.tex`, and `every_shipped_kind...` below is where those two facts are held together.
        extension: "tex",
        name_suffix: "",
        takes_a_title: false,
        needs_a_language: false,
        names_its_body: false,
        carries_pictures: false,
        takes_a_page_size: false,
        needs_pandoc: true,
        needs_a_font: true,
        defaults: include_str!("../assets/export/export.latex.yaml"),
        ships_fonts: false,
    },
    ExportKind {
        kind: "html",
        extension: "html",
        name_suffix: "",
        // The page's `<title>` is the reader's tab, not a line of the document: nothing in the body
        // says it, so it comes from the note.
        takes_a_title: true,
        needs_a_language: false,
        names_its_body: false,
        carries_pictures: true,
        takes_a_page_size: false,
        needs_pandoc: true,
        needs_a_font: false,
        defaults: include_str!("../assets/export/export.html.yaml"),
        ships_fonts: false,
    },
    ExportKind {
        kind: "epub",
        extension: "epub",
        name_suffix: "",
        // A book has a title page and a required `<dc:title>`, and a required `<dc:language>`
        // (measured: without one pandoc writes `C`, and the title page reads UNTITLED).
        takes_a_title: true,
        needs_a_language: true,
        // And it is the one kind whose body the window writes: see `names_its_body`.
        names_its_body: true,
        carries_pictures: true,
        takes_a_page_size: false,
        needs_pandoc: true,
        needs_a_font: false,
        defaults: include_str!("../assets/export/export.epub.yaml"),
        ships_fonts: false,
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
        names_its_body: false,
        carries_pictures: false,
        // The one kind whose engine draws a page the app can size: see `takes_a_page_size`, and the
        // one kind the card offers a size and an orientation for.
        takes_a_page_size: true,
        needs_pandoc: true,
        needs_a_font: true,
        defaults: include_str!("../assets/export/export.pdf.yaml"),
        ships_fonts: true,
    },
    ExportKind {
        kind: "markdown",
        extension: "md",
        // Not the note's own name: `note.md` beside `note.md` is the note.
        name_suffix: ".processed",
        takes_a_title: false,
        needs_a_language: false,
        names_its_body: false,
        carries_pictures: true,
        takes_a_page_size: false,
        // No defaults file at all: there is no pandoc left to hand one to, and a file made of nothing
        // would be a file a reader could edit with no effect.
        needs_pandoc: false,
        needs_a_font: false,
        defaults: "",
        ships_fonts: false,
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
    /// Whether the window writes this kind's body rather than handing over the note's own text: the
    /// body keeps the note's own level-1 heading, its name standing in it when the note writes none.
    pub names_its_body: bool,
    /// Whether the kind's output can hold a picture as it is — an SVG or a webp. The window draws a
    /// picture it cannot carry as a PNG itself (`ui/export/raster_picture.ts`).
    pub carries_pictures: bool,
    /// Whether the card offers a **page size and an orientation** for this kind.
    pub takes_a_page_size: bool,
    /// The sizes the card offers, in the order it offers them, each with the words a reader reads and
    /// the option behind them ([`PAPER_SIZES`]). Empty for a kind that takes no page size.
    pub paper_sizes: Vec<PaperSize>,
    /// Where the reader's copy of the defaults file is — there whether or not it exists yet.
    pub config_path: String,
    /// Whether that copy has been written yet. A missing one is made by the first export or by
    /// opening it for editing; a query never writes.
    pub config_exists: bool,
    /// Whether that copy is **the one this build ships**, byte for byte — so the card can offer to
    /// replace it only when there is something to replace ([`export_restore_config`]).
    ///
    /// A copy that differs may have been edited by the reader or written by an older build; the two
    /// cannot be told apart from here, and the card does not try: it says what the button does and
    /// lets the reader answer.
    pub config_is_shipped: bool,
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
        .ok_or_else(|| crate::i18n::now("export.noSuchKind", &[("kind", kind)]))
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
        .map_err(|error| crate::i18n::now("export.noDataFolder", &[("reason", &error.to_string())]))
}

/// The reader's copy of a kind's defaults file, written from the shipped one when it is not there.
///
/// The write happens **once**: a file that exists is left exactly as it is, because the point of
/// keeping it on the disk is that an edited one stays edited.
fn ensure_defaults_in(dir: &Path, kind: &ExportKind) -> Result<PathBuf, String> {
    fs::create_dir_all(dir)
        .map_err(|error| crate::i18n::now("export.cannotMake", &[("path", &dir.display().to_string()), ("reason", &error.to_string())]))?;
    let path = dir.join(config_file_name(kind.kind));
    if !path.exists() {
        fs::write(&path, kind.defaults)
            .map_err(|error| crate::i18n::now("export.cannotWrite", &[("path", &path.display().to_string()), ("reason", &error.to_string())]))?;
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
        .map_err(|error| crate::i18n::now("export.cannotMake", &[("path", &styles.display().to_string()), ("reason", &error.to_string())]))?;
    let path = styles.join(format!("{}.csl", style_file_name(&style.name)));
    if fs::read_to_string(&path).ok().as_deref() != Some(style.xml.as_str()) {
        fs::write(&path, &style.xml)
            .map_err(|error| crate::i18n::now("export.cannotWrite", &[("path", &path.display().to_string()), ("reason", &error.to_string())]))?;
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
        return Err(crate::i18n::now("export.debugOnly", &[("what", "pandoc")]));
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
        return Err(crate::i18n::now("export.debugOnly", &[("what", "curl")]));
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
    let config_exists = config.as_deref().is_some_and(Path::exists);
    // The file is the one this build ships — byte for byte, or not written at all, in which case the
    // shipped bytes are what an export would use.
    let config_is_shipped = config
        .as_deref()
        .map(|path| fs::read(path).map(|bytes| bytes == kind.defaults.as_bytes()).unwrap_or(true))
        .unwrap_or(false);
    ExportKindInfo {
        kind: kind.kind.to_string(),
        extension: kind.extension.to_string(),
        name_suffix: kind.name_suffix.to_string(),
        needs_pandoc: kind.needs_pandoc,
        takes_a_title: kind.takes_a_title,
        needs_a_language: kind.needs_a_language,
        names_its_body: kind.names_its_body,
        carries_pictures: kind.carries_pictures,
        takes_a_page_size: kind.takes_a_page_size,
        paper_sizes: kind
            .takes_a_page_size
            .then(|| {
                PAPER_SIZES
                    .iter()
                    .map(|(label, value)| PaperSize {
                        label: label.to_string(),
                        value: value.to_string(),
                    })
                    .collect()
            })
            .unwrap_or_default(),
        config_exists,
        config_is_shipped,
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
        .map_err(|error| crate::i18n::now("export.cannotMake", &[("path", &scratch.display().to_string()), ("reason", &error.to_string())]))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or(0);
    let path = scratch.join(format!("note-{}-{stamp}.md", std::process::id()));
    fs::write(&path, text).map_err(|error| crate::i18n::now("export.cannotWrite", &[("path", &path.display().to_string()), ("reason", &error.to_string())]))?;
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
        .map_err(|error| {
            crate::i18n::now(
                "app.cannotRun",
                &[("program", &pandoc.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
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

/// The extension a picture's own content type has — for the picture types this app can carry or
/// draw, and for nothing else. The five Word holds are handed over as they are, and an SVG or a webp
/// is kept as itself here so the window can carry it in a book or draw it for a Word file
/// (`ui/export/raster_picture.ts`). A file named wrongly is a picture no reader will draw, and a page
/// that answered instead of a picture is not a picture at all.
fn image_extension(content_type: &str) -> Option<&'static str> {
    match content_type.split(';').next().unwrap_or("").trim() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/bmp" => Some("bmp"),
        "image/tiff" => Some("tiff"),
        "image/svg+xml" => Some("svg"),
        "image/webp" => Some("webp"),
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
        .map_err(|error| {
            crate::i18n::now(
                "app.cannotRun",
                &[("program", &curl.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
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
    fs::create_dir_all(dir).map_err(|error| crate::i18n::now("export.cannotMake", &[("path", &dir.display().to_string()), ("reason", &error.to_string())]))?;
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
            // The type is named in the reader's language only when the *app* is what has no answer for
            // it; a type the server wrote down is the server's own name and stays as it is.
            let kind = if content_type.is_empty() {
                crate::i18n::now("export.pictureNoType", &[])
            } else {
                content_type.clone()
            };
            return Err(crate::i18n::now(
                "export.pictureType",
                &[("url", &url), ("type", &kind)],
            ));
        }
    };
    let path = dir.join(format!("{name}.{extension}"));
    fs::rename(&partial, &path)
        .map_err(|error| crate::i18n::now("export.cannotName", &[("path", &path.display().to_string()), ("reason", &error.to_string())]))?;
    Ok(path)
}

/// A picture the note names on the web, brought down as a local file for the pre-process to hand
/// over or, for a kind that cannot carry an SVG or a webp, to draw as a PNG
/// (`ui/export/export_flow.ts`).
///
/// The app fetches it because pandoc may not be able to: a pandoc built without HTTP support answers
/// *"Could not fetch resource …"* and puts the picture's description in the document, which is the
/// hole this fills. A URL that cannot be fetched, or that is not a picture this app can carry or
/// draw, is an error here and the window leaves the destination exactly as the note wrote it —
/// pandoc's own warning about it reaches the reader either way (`ExportOutcome.warnings`).
#[tauri::command]
pub fn export_fetch_image(app: tauri::AppHandle, url: String) -> Result<String, String> {
    let curl = find_curl()
        .0
        .ok_or_else(|| crate::i18n::now("export.noCurl", &[]))?;
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
    let result = pandoc_arguments(&dir, &defaults, &note, request, kind, header.as_deref()).and_then(
        |arguments| {
            run_pandoc(
                &pandoc,
                &arguments,
                request.source_dir.as_deref().map(Path::new),
            )
            .map(|warnings| ExportOutcome { warnings })
        },
    );
    // The note's copy under the app's data folder is a thing of this call, whatever pandoc said —
    // and so are the pictures fetched for it. A picture is re-fetched rather than remembered: the
    // page it came from may have changed since the last export.
    let _ = fs::remove_file(&note);
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
fn pandoc_arguments(
    dir: &Path,
    defaults: &Path,
    note: &Path,
    request: &ExportRequest,
    kind: &ExportKind,
    header: Option<&Path>,
) -> Result<Vec<OsString>, String> {
    let mut arguments: Vec<OsString> = vec![
        OsString::from("--defaults"),
        defaults.as_os_str().to_os_string(),
        OsString::from("--output"),
        OsString::from(&request.output_path),
    ];
    if let Some(header) = header {
        arguments.push(OsString::from("--include-in-header"));
        arguments.push(header.as_os_str().to_os_string());
    }
    if !request.resource_paths.is_empty() {
        let paths: Vec<PathBuf> = request.resource_paths.iter().map(PathBuf::from).collect();
        let joined = std::env::join_paths(&paths)
            .map_err(|error| crate::i18n::now("export.cannotSearch", &[("path", request.output_path.as_str()), ("reason", &error.to_string())]))?;
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
        return Err(crate::i18n::now("export.noConfiguration", &[("kind", kind.kind)]));
    }
    let path = ensure_defaults_in(&export_dir(&app)?, kind)?;
    Ok(path.to_string_lossy().into_owned())
}

/// Writes the copy this build ships over the reader's own, because the reader asked for it.
///
/// The card offers the button only when the two differ ([`ExportKindInfo::config_is_shipped`]) and
/// only after the app's own question, which says what is replaced — so a copy that *is* the shipped one
/// is never offered, and a file is never changed under a reader who has not agreed to it. That is the
/// one thing a file the reader may have edited must never suffer, and why this is a command with a
/// question in front of it rather than anything the app does by itself.
#[tauri::command]
pub fn export_restore_config(app: tauri::AppHandle, kind: String) -> Result<String, String> {
    let kind = kind_of(&kind)?;
    if !kind.needs_pandoc {
        return Err(crate::i18n::now("export.noConfiguration", &[("kind", kind.kind)]));
    }
    let path = export_dir(&app)?.join(config_file_name(kind.kind));
    crate::files::write_atomically(&path, kind.defaults)
        .map_err(|error| crate::i18n::now("export.cannotWrite", &[("path", &path.display().to_string()), ("reason", &error.to_string())]))?;
    Ok(path.to_string_lossy().into_owned())
}

/// What a kind's conversion settings name, as the window reads it: whether the kind's output is
/// typeset with those fonts at all, whether a font is named for the document as a whole, and whether
/// one is named for CJK.
///
/// The characters are the *window's* half of the question (`ui/export/font_hint.ts`): a formula is not
/// a paragraph — `$x \le y$` draws with the maths font where a bare `≤` does not — so the rule needs
/// the parse, and the parse lives in the webview. What this side owns is the file: its bytes, the
/// shipped copy when the reader has not written one yet, and the one word to look for in it.
///
/// A **comment does not count**. The shipped files' headers talk about fonts at length — they explain
/// what happens without one — and a copy of them must not read as a reader who has chosen (measured the
/// hard way: the app once stepped aside for its own documentation and the characters stayed missing).
#[tauri::command]
pub fn export_named_fonts(app: tauri::AppHandle, kind: String) -> Result<NamedFonts, String> {
    let kind = kind_of(&kind)?;
    let settings = if kind.needs_pandoc {
        settings_text(&app, kind)?
    } else {
        String::new()
    };
    let (mainfont, cjk_mainfont) = named_fonts(&settings);
    Ok(NamedFonts {
        needs_a_font: kind.needs_a_font,
        mainfont: mainfont.is_some(),
        cjk_mainfont: cjk_mainfont.is_some(),
        // What this build's own faces draw, for the kind whose page they draw: the window asks the
        // fonts, not a list of code points kept beside them (`fonts::bundled::coverage`), so a face
        // swapped for another cannot leave the card quiet about a page that lost a character.
        shipped: kind
            .ships_fonts
            .then(|| crate::fonts::bundled::fonts_dir(&app))
            .transpose()?
            .map(|faces| {
                crate::fonts::bundled::coverage(&faces)
                    .iter()
                    .map(|[first, last]| [*first, *last])
                    .collect()
            })
            .unwrap_or_default(),
        // The scripts the file names a face for itself: those are drawn with *that* face, so the hint
        // has the same reason to stay quiet about them as about a named `mainfont` — the reader's font
        // is taken to hold what they chose it for.
        named_scripts: kind
            .ships_fonts
            .then(|| {
            crate::fonts::bundled::reader_scripts(&settings)
                    .into_iter()
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        // The names this file writes that no font on this machine answers to. XeTeX stops the whole
        // export on one of those — *"The font … cannot be found"* rather than a fallback — so the card
        // says it while the reader is still looking at the file's name on the card.
        unknown_fonts: if kind.needs_a_font {
            crate::fonts::bundled::named_values(&settings)
                .into_iter()
                .filter(|name| !crate::fonts::system::has_family(name))
                .collect()
        } else {
            Vec::new()
        },
    })
}

/// What a kind's conversion settings name, as the window is told it.
#[derive(Debug, Serialize, Clone)]
pub struct NamedFonts {
    /// Whether the kind's output is typeset with the fonts its settings name (see `ExportKind`).
    pub needs_a_font: bool,
    /// Whether a font is named for the document as a whole: it answers for anything it has.
    pub mainfont: bool,
    /// Whether a font is named for CJK — which xeCJK routes **CJK punctuation, kana, Han and Hangul**
    /// to (measured: with both variables named, a Korean note's Hangul was set with the *CJK* font and
    /// lost with it).
    pub cjk_mainfont: bool,
    /// The code points the faces **this build ships** draw, as `[first, last]` ranges — empty for a
    /// kind whose page they do not draw.
    ///
    /// It is what makes the card's hint quiet about a note this build can already set: with nothing
    /// named, a page draws ten scripts (see `fonts::bundled`), and reporting those characters as lost
    /// would be the hint telling the reader to fix something that is not broken.
    pub shipped: Vec<[u32; 2]>,
    /// The scripts the settings file names a face of its own for, as the header spells them
    /// (`Hebrew`, `Thai`, …; empty for a kind whose page the shipped faces do not draw).
    pub named_scripts: Vec<String>,
    /// The fonts the settings file names that this machine does not have, each once — empty when every
    /// name it writes is one the machine answers to, and for a kind that names no font at all.
    pub unknown_fonts: Vec<String>,
}

/// The family name of a font **this machine has** that draws every one of `points`, or none.
///
/// The window asks this when the card's hint has characters no font in the settings file can draw, and
/// what it gets back is a name the reader can type — checked against the font's own `cmap`, not guessed
/// from its name (measured: the macOS `Songti SC` draws Han and kana and no Hangul at all). There is no
/// list of platform names here on purpose: a machine answers for itself, which is the only answer that
/// holds on a machine nobody here has measured.
#[tauri::command]
pub fn export_font_for(points: Vec<u32>) -> Option<String> {
    crate::fonts::system::covering(&points)
}

/// The settings a kind would be run with, as their own text: the reader's copy when it has been
/// written, and the copy this build ships when it has not — what the app *would* write on the first
/// export, which is what the reader is looking at either way.
fn settings_text(app: &tauri::AppHandle, kind: &ExportKind) -> Result<String, String> {
    let dir = export_dir(app)?;
    let path = dir.join(config_file_name(kind.kind));
    Ok(fs::read_to_string(&path).unwrap_or_else(|_| kind.defaults.to_string()))
}

/// The document's own font and Han's, as `settings` names them — `(mainfont, CJKmainfont)`, each absent
/// when the file names none. The reading itself is `fonts::bundled::named`, which is also what the header
/// reads the per-script lines with, so which key names a font has one home.
fn named_fonts(settings: &str) -> (Option<String>, Option<String>) {
    (
        crate::fonts::bundled::named(settings, "mainfont"),
        crate::fonts::bundled::named(settings, "CJKmainfont"),
    )
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
    fn a_copy_the_build_ships_is_known_to_be_that_one() {
        let dir = scratch("config-is-shipped");
        let kind = &KINDS[0];

        // No file yet: the shipped bytes are what an export would use, and there is nothing to
        // replace — the card asks `config_exists` as well, so nothing is offered.
        assert!(!kind_info(&dir, kind).config_exists);
        assert!(kind_info(&dir, kind).config_is_shipped);

        // The copy this build wrote is that one, byte for byte: nothing to replace.
        ensure_defaults_in(&dir, kind).unwrap();
        assert!(kind_info(&dir, kind).config_exists);
        assert!(kind_info(&dir, kind).config_is_shipped);

        // An edit changes that — and so would a copy written by an older build, which is why the card
        // says what the button does rather than claiming to know which of the two it is looking at.
        fs::write(dir.join("export.docx.yaml"), "# edited\n").unwrap();
        assert!(kind_info(&dir, kind).config_exists);
        assert!(!kind_info(&dir, kind).config_is_shipped);
        let _ = fs::remove_dir_all(&dir);
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
            paper: None,
            landscape: None,
            suppress_references: false,
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
            None,
        )
        .unwrap()
        .iter()
        .map(|argument| argument.to_string_lossy().into_owned())
        .collect()
    }

    /// The shipped faces draw a PDF page and nothing else — the LaTeX kind is compiled on the reader's
    /// own machine, where this app's bundle is not — and the header reaches pandoc as one more
    /// argument, beside the settings file rather than instead of anything in it.
    #[test]
    fn only_the_kind_whose_page_the_shipped_faces_draw_ships_fonts() {
        let shipping: Vec<&str> = KINDS
            .iter()
            .filter(|kind| kind.ships_fonts)
            .map(|kind| kind.kind)
            .collect();
        assert_eq!(shipping, vec!["pdf"]);

        let dir = scratch("header");
        let request = request_in(&dir);
        let header = dir.join("pdf-fonts.tex");
        let name = "pdf".to_string();
        let arguments = pandoc_arguments(
            &dir,
            &dir.join("export.pdf.yaml"),
            &dir.join("note-1.md"),
            &ExportRequest { kind: name, ..request },
            kind_of("pdf").unwrap(),
            Some(&header),
        )
        .unwrap()
        .iter()
        .map(|argument| argument.to_string_lossy().into_owned())
        .collect::<Vec<String>>();
        let at = arguments
            .iter()
            .position(|argument| argument == "--include-in-header")
            .expect("the header is not in the arguments");
        assert_eq!(arguments[at + 1], header.to_string_lossy());
        // And nothing stands in for the settings file: it is still named, as it always was.
        assert!(arguments.contains(&dir.join("export.pdf.yaml").to_string_lossy().into_owned()));
        let _ = fs::remove_dir_all(&dir);
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

    /// One kind's body is not the note's own text: a book's keeps the note's own level-1 heading, and
    /// the window writes the note's name into it when the note writes none (`ui/export/book_body.ts`).
    #[test]
    fn only_a_book_is_handed_a_body_of_the_windows_making() {
        let writing: Vec<&str> = KINDS
            .iter()
            .filter(|kind| kind.names_its_body)
            .map(|kind| kind.kind)
            .collect();
        assert_eq!(writing, vec!["epub"]);
    }

    /// Only one kind's page is the app's to lay out, and the card is offered the sizes for it alone.
    #[test]
    fn only_the_kind_whose_engine_draws_a_page_is_offered_a_size_for_it() {
        let sizing: Vec<&str> = KINDS
            .iter()
            .filter(|kind| kind.takes_a_page_size)
            .map(|kind| kind.kind)
            .collect();
        assert_eq!(sizing, vec!["pdf"]);
    }

    /// The kinds whose output can hold a picture as it is — an SVG or a webp — and nothing else: a page
    /// of HTML and a book can, and the app's own hand leaves the note's destinations as written.
    #[test]
    fn only_the_kinds_that_can_hold_a_picture_as_it_is_say_they_can() {
        let pictures: Vec<&str> = KINDS
            .iter()
            .filter(|kind| kind.carries_pictures)
            .map(|kind| kind.kind)
            .collect();
        assert_eq!(pictures, vec!["html", "epub", "markdown"]);
    }

    /// A page a reader asked for is `geometry` options, and nothing at all for *the file's own*: a
    /// `papersize` on the command line is concatenated with the reader's own file instead of replacing
    /// it (`a4letterpaper`, a LaTeX warning), where geometry's options are appended after the file's
    /// and take the page with them — measured, all four of those pages (see `PAPER_SIZES`).
    #[test]
    fn a_page_a_reader_asks_for_is_a_geometry_option() {
        let dir = scratch("paper");
        let request = request_in(&dir);
        let pdf = |paper: Option<&str>, landscape: Option<bool>| {
            let request = ExportRequest {
                kind: "pdf".to_string(),
                paper: paper.map(str::to_string),
                landscape,
                ..request_in(&dir)
            };
            named_arguments_for(&dir, &request, kind_of("pdf").unwrap())
        };

        // The card's own answer: the settings file's page, and the arguments pandoc was already given.
        assert!(!pdf(None, None).contains(&"--variable".to_string()));

        assert_eq!(
            pdf(Some("letterpaper"), None)
                .iter()
                .filter(|argument| *argument == "--variable" || argument.starts_with("geometry="))
                .collect::<Vec<&String>>(),
            vec!["--variable", "geometry=letterpaper"]
        );
        // An orientation of its own is asked for as much as a size is: a file saying landscape has to
        // be able to be overruled by a reader who wants this one page portrait (measured).
        assert_eq!(
            pdf(None, Some(false))
                .iter()
                .filter(|argument| argument.starts_with("geometry="))
                .collect::<Vec<&String>>(),
            vec!["geometry=portrait"]
        );
        assert_eq!(
            pdf(None, Some(true))
                .iter()
                .filter(|argument| argument.starts_with("geometry="))
                .collect::<Vec<&String>>(),
            vec!["geometry=landscape"]
        );
        assert_eq!(
            pdf(Some("a4paper"), Some(true))
                .iter()
                .filter(|argument| argument.starts_with("geometry="))
                .collect::<Vec<&String>>(),
            vec!["geometry=a4paper", "geometry=landscape"]
        );
        // A size for a kind whose page is not the app's to lay out is nothing at all.
        let docx = ExportRequest {
            paper: Some("letterpaper".to_string()),
            landscape: Some(true),
            ..request
        };
        assert!(!named_arguments(&dir, &docx)
            .iter()
            .any(|argument| argument.starts_with("geometry=")));

        // And a size this build does not know is refused rather than handed to LaTeX.
        let request = ExportRequest {
            kind: "pdf".to_string(),
            paper: Some("tabloid".to_string()),
            ..request_in(&dir)
        };
        let refusal = pandoc_arguments(
            &dir,
            &dir.join("export.pdf.yaml"),
            &dir.join("note-1.md"),
            &request,
            kind_of("pdf").unwrap(),
            None,
        )
        .expect_err("a size that is not in the list was passed on");
        assert!(refusal.contains("tabloid"), "{refusal}");
        let _ = fs::remove_dir_all(&dir);
    }

    /// A reader who wants the keys resolved and *no list* asks for it in metadata: measured, the same
    /// word under `variables:` leaves the list exactly where it was, and a defaults file's own
    /// `metadata:` block — or this record — takes it away. A kind with no bibliography has no list to
    /// suppress, so nothing is said at all.
    #[test]
    fn a_list_the_reader_does_not_want_is_suppressed_in_metadata() {
        let dir = scratch("suppress");
        fs::write(dir.join("library.bib"), "@article{smith2020}\n").unwrap();
        let asked = named_arguments(
            &dir,
            &ExportRequest {
                suppress_references: true,
                ..request_in(&dir)
            },
        );
        let at = asked
            .iter()
            .position(|argument| argument == "suppress-bibliography=true")
            .expect("the list the reader asked away was not suppressed");
        assert_eq!(asked[at - 1], "--metadata");
        assert!(!asked.iter().any(|argument| argument.starts_with("suppress-bibliography=")
            && argument != "suppress-bibliography=true"));

        // Not asked: nothing said.
        assert!(!named_arguments(&dir, &request_in(&dir))
            .iter()
            .any(|argument| argument.starts_with("suppress-bibliography=")));
        // Asked, but with no library: nothing to suppress.
        assert!(!named_arguments(
            &dir,
            &ExportRequest {
                suppress_references: true,
                bibliography: None,
                ..request_in(&dir)
            }
        )
        .iter()
        .any(|argument| argument.starts_with("suppress-bibliography=")));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_kind_whose_output_would_be_the_note_itself_names_it_otherwise() {
        // The one row whose extension is markdown's own: its target is the note's own folder and the
        // note's own name, so without this the export would write over the document it is exporting.
        assert_eq!(kind_of("markdown").unwrap().name_suffix, ".processed");
        assert_eq!(kind_of("pdf").unwrap().name_suffix, "");
    }

    /// What a settings file names, as the names themselves: the header that wires in the shipped faces
    /// draws Han and kana with the CJK name, so a yes-or-no would not be enough to hand it over.
    #[test]
    fn a_file_names_its_fonts_and_a_comment_names_nothing() {
        let (main, cjk) = named_fonts(
            "variables:\n  mainfont: \"Arial Unicode MS\"\n  CJKmainfont: \"Songti SC\" # mine\n",
        );
        assert_eq!(main.as_deref(), Some("Arial Unicode MS"));
        assert_eq!(cjk.as_deref(), Some("Songti SC"));

        // The file this build ships talks about both variables in its header, and names neither: the
        // shipped faces are what draw Han, kana and Hangul until a reader writes a line of their own.
        let pdf = KINDS.iter().find(|kind| kind.kind == "pdf").unwrap();
        assert_eq!(named_fonts(pdf.defaults), (None, None));

        // A reader's copy of an *older* build's file still names one, and that name is still honored.
        let (_, cjk) = named_fonts("variables:\n  CJKmainfont: \"Songti SC\"\n");
        assert_eq!(cjk.as_deref(), Some("Songti SC"));
    }

    #[test]
    fn a_file_names_a_font_when_a_line_that_is_not_a_comment_says_so() {
        // The two variables, as the names themselves — the CJK one is handed to the header that draws
        // Han and kana, so a yes-or-no would not do — and the two spellings that look like one of them
        // without being it.
        assert_eq!(
            named_fonts("variables:\n  CJKmainfont: \"Songti SC\"\n"),
            (None, Some("Songti SC".to_string()))
        );
        assert_eq!(
            named_fonts("variables:\n  mainfont: \"Arial Unicode MS\"\n"),
            (Some("Arial Unicode MS".to_string()), None)
        );
        assert_eq!(named_fonts("variables:\n  sansfont: X\n  monofont: Y\n"), (None, None));

        // A **comment** names nothing: the shipped files' headers talk about fonts at length — they
        // explain what happens without one and how to add it — and reading that as a reader who has
        // chosen is the mistake that once left the characters missing.
        assert_eq!(
            named_fonts("# add `mainfont: \"Arial Unicode MS\"` for other scripts\nreader: markdown\n"),
            (None, None)
        );
        assert_eq!(
            named_fonts("variables:\n  # mainfont: \"X\"\n  CJKmainfont: \"Songti SC\"\n"),
            (None, Some("Songti SC".to_string()))
        );
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
        assert_eq!(image_extension("image/svg+xml"), Some("svg"));
        assert_eq!(image_extension("image/svg+xml; charset=utf-8"), Some("svg"));
        assert_eq!(image_extension("image/webp"), Some("webp"));
        assert_eq!(image_extension("IMAGE/GIF"), None); // curl reports lower case; anything else is
        assert_eq!(image_extension("image/png; charset=binary"), Some("png"));
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
