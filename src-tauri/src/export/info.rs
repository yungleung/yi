//! What the export card is told about the shipped kinds: their facts and where their configs live.
//!
//! The card asks once for the whole list, and a query never writes a file: a missing defaults copy is
//! named as missing, and the first export or an explicit edit makes it.
//!
//! May import: the kind vocabulary, the export folder and the pandoc search. Upholds: the card sees
//! the same row and the same config path the run will use.

use serde::Serialize;
use std::fs;
use std::path::Path;

use super::config::export_dir;
use super::kinds::{config_file_name, ExportKind, PaperSize, KINDS, PAPER_SIZES};
use super::pandoc::find_pandoc;

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
/// The kinds the dialog offers: what the app ships, and where each one's config file is.
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
pub(super) fn kind_info(dir: &Path, kind: &ExportKind) -> ExportKindInfo {
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
