//! Every export kind this build ships, in the order the export dialog shows them.
//!
//! Example: adding an HTML presentation means adding one complete `ExportKind` row here; the menu,
//! card, template validation and run all discover it from this list.
//!
//! May import: the kind model and the defaults assets this compile ships. Upholds: one row per
//! kind, and each row carries every capability its consumers need.

use super::kind_model::{ExportGroup, ExportKind, KindTemplate};

/// Every kind of export this build ships, in the order the dialog shows them.
pub const KINDS: &[ExportKind] = &[
    ExportKind {
        group: ExportGroup::Documents,
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
        defaults: include_str!("../../../assets/export/export.docx.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::ReferenceDoc,
    },
    ExportKind {
        group: ExportGroup::Documents,
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
        defaults: include_str!("../../../assets/export/export.odt.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::ReferenceDoc,
    },
    ExportKind {
        group: ExportGroup::Documents,
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
        defaults: include_str!("../../../assets/export/export.latex.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::Text,
    },
    ExportKind {
        group: ExportGroup::Documents,
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
        defaults: include_str!("../../../assets/export/export.html.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::Text,
    },
    ExportKind {
        group: ExportGroup::Presentations,
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
        defaults: include_str!("../../../assets/export/export.revealjs.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::None,
    },
    ExportKind {
        group: ExportGroup::Documents,
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
        defaults: include_str!("../../../assets/export/export.epub.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::Text,
    },
    ExportKind {
        group: ExportGroup::Documents,
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
        defaults: include_str!("../../../assets/export/export.pdf.yaml"),
        ships_fonts: true,
        template_mode: KindTemplate::Text,
    },
    ExportKind {
        group: ExportGroup::Presentations,
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
        defaults: include_str!("../../../assets/export/export.beamer.yaml"),
        ships_fonts: false,
        template_mode: KindTemplate::None,
    },
    ExportKind {
        group: ExportGroup::Other,
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
