//! The types that describe an export kind and the choices a kind can offer.
//!
//! Example: the PDF row takes a page size and ships fonts, while the docx row takes neither; both
//! are expressed by the same `ExportKind` shape rather than by checks on the name `"pdf"`.
//!
//! May import: `serde`. Upholds: every capability is a value in the row, so the card and the run
//! do not grow separate format-name matches.

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

/// Where the Export Manager lists a kind.
///
/// This is a fact of the kind catalogue so a new kind cannot be added without deciding where a
/// reader finds it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExportGroup {
    Documents,
    Presentations,
    Other,
}

/// One kind of export the app knows.
#[derive(Debug)]
pub struct ExportKind {
    /// Where the Export Manager lists this kind: with the documents, the presentations, or the
    /// kinds that are neither.
    pub group: ExportGroup,
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
    /// so the app writes that text out itself and there is no pandoc to hand a defaults file to.
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
    /// header of its own (`fonts/`): the PDF, and only the PDF.
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
