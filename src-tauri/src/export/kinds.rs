//! The vocabulary of an export: the kinds this build ships, their page sizes and their names.
//!
//! A kind is one row of [`KINDS`] — its name, extension, which settings file it reads and what its
//! output can hold. Nothing here runs a conversion or touches the disk; the rows are the facts the
//! menu, the card and the run agree on.
//!
//! May import: `serde` and the assets this compile ships. Upholds: one row per kind, so a kind is
//! added in one place and its name is refused if it is not there.

use serde::{Deserialize, Serialize};

/// What kind of file a pandoc format takes as its form: a text template, a binary reference
/// document, or nothing at all.
///
/// It is a fact of the *kind*, so the export card and the run read the same row rather than each
/// deciding which of the seven formats is which.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum KindTemplate {
    Text,
    ReferenceDoc,
    None,
}

/// How one package's entry is used: a pandoc text template, a complete document with `$body$`
/// inserted (a wrapper), or a binary reference document.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TemplateMode {
    Template,
    Wrapper,
    ReferenceDoc,
}

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
    /// What a package for this kind hands pandoc: a text template, a reference document, or nothing.
    /// `markdown` says none because its conversion is the app's own pre-process.
    pub template_mode: KindTemplate,
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
        defaults: include_str!("../../assets/export/export.docx.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::ReferenceDoc,
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
        defaults: include_str!("../../assets/export/export.odt.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::ReferenceDoc,
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
        defaults: include_str!("../../assets/export/export.latex.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::Text,
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
        defaults: include_str!("../../assets/export/export.html.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::Text,
    },
    ExportKind {
        kind: "revealjs",
        extension: "html",
        name_suffix: "",
        // The title, theme, transition and slide level are the note's own
        // frontmatter metadata; the window never substitutes a title.
        takes_a_title: false,
        needs_a_language: false,
        names_its_body: false,
        carries_pictures: true,
        takes_a_page_size: false,
        needs_pandoc: true,
        needs_a_font: false,
        defaults: include_str!("../../assets/export/export.revealjs.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::None,
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
        defaults: include_str!("../../assets/export/export.epub.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::Text,
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
        defaults: include_str!("../../assets/export/export.pdf.yaml"),
        ships_fonts: true,
        template_mode: KindTemplate::Text,
    },
    ExportKind {
        kind: "beamer",
        extension: "pdf",
        name_suffix: "",
        // Title, institute, theme, colors, fonts and ratio are note metadata.
        takes_a_title: false,
        needs_a_language: false,
        names_its_body: false,
        carries_pictures: false,
        takes_a_page_size: false,
        needs_pandoc: true,
        needs_a_font: true,
        defaults: include_str!("../../assets/export/export.beamer.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::None,
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
        template_mode: KindTemplate::None,
    },
];

/// The kind asked for, or the one sentence worth saying when the app does not have it.
pub(super) fn kind_of(kind: &str) -> Result<&'static ExportKind, String> {
    KINDS
        .iter()
        .find(|known| known.kind == kind)
        .ok_or_else(|| crate::i18n::now("export.noSuchKind", &[("kind", kind)]))
}

/// The name a kind's defaults file has in the export folder: the one fact the app writes down about
/// where a config lives, so a reader looking for it is looking for the name this made.
pub(super) fn config_file_name(kind: &str) -> String {
    format!("export.{kind}.yaml")
}

