//! The stable vocabulary shared by export rows, the card and the run.
//!
//! The row contract is in `kind_model`, the shipped rows are in `kind_catalogue`, and the page
//! sizes are in `paper_sizes`. Callers keep naming `export::kinds::{…}` while each fact has one
//! home.
//!
//! Example: `kind_of("pdf")` returns the PDF row, while `kind_of("rtf")` returns the localized
//! “unknown kind” error used by a stale menu or an external client.
//!
//! May import: this facade's focused children and the app's translation helper. Upholds: one row
//! per kind, so a kind is added in one place and its name is refused if it is not there.

mod kind_catalogue;
mod kind_model;
mod paper_sizes;

pub use kind_catalogue::KINDS;
pub use kind_model::{ExportGroup, ExportKind, KindTemplate, PaperSize, TemplateMode};
pub use paper_sizes::PAPER_SIZES;

/// The kind asked for, or the one sentence worth saying when the app does not have it.
pub(super) fn kind_of(kind: &str) -> Result<&'static ExportKind, String> {
    KINDS
        .iter()
        .find(|known| known.kind == kind)
        .ok_or_else(|| crate::i18n::now("export.noSuchKind", &[("kind", kind)]))
}

/// The name a kind's defaults file has in the export folder.
///
/// Example: `config_file_name("docx")` returns `"export.docx.yaml"`, which is the same name the
/// config panel edits and the run ensures exists.
pub(super) fn config_file_name(kind: &str) -> String {
    format!("export.{kind}.yaml")
}
