//! Turning the note on screen into a file another program can read.
//!
//! The conversion is pandoc's, and so are its parameters: a kind is a YAML defaults file in the
//! app's data folder, handed to pandoc as `--defaults`. One kind — processed markdown — is the
//! app's own hand. This module is the facade over the jobs that make that work: the kind table,
//! the export folder, the two external-program seams, remote pictures, font hints and the run.
//!
//! May import: the child modules and their public surface. Upholds: the command paths in `lib.rs`
//! stay `export::…`, so a split by responsibility does not change the window's IPC.

mod config;
mod curl;
mod font_hints;
mod info;
mod kinds;
mod pandoc;
mod pictures;
mod run;
mod search;

#[allow(unused_imports)]
pub use config::CslStyle;
#[allow(unused_imports)]
pub use curl::find_curl;
pub use font_hints::NamedFonts;
#[allow(unused_imports)]
pub use info::{ExportKindInfo, ExportKinds};
#[allow(unused_imports)]
pub use kinds::{ExportKind, PaperSize, KINDS, PAPER_SIZES};
#[allow(unused_imports)]
pub use pandoc::find_pandoc;
pub use run::{ExportOutcome, ExportRequest};

/// The commands stay at `export::…` even though their work lives in a child module: Tauri's
/// generated command handlers belong to the module that writes the attribute, and `lib.rs` names
/// these paths.
#[tauri::command]
pub fn export_kinds(app: tauri::AppHandle) -> Result<ExportKinds, String> {
    info::export_kinds(app)
}

#[tauri::command]
pub fn run_export(app: tauri::AppHandle, request: ExportRequest) -> Result<ExportOutcome, String> {
    run::run_export(app, request)
}

#[tauri::command]
pub fn export_config_path(app: tauri::AppHandle, kind: String) -> Result<String, String> {
    config::export_config_path(app, kind)
}

#[tauri::command]
pub fn export_restore_config(app: tauri::AppHandle, kind: String) -> Result<String, String> {
    config::export_restore_config(app, kind)
}

#[tauri::command]
pub fn export_named_fonts(app: tauri::AppHandle, kind: String) -> Result<NamedFonts, String> {
    font_hints::export_named_fonts(app, kind)
}

#[tauri::command]
pub fn export_font_for(points: Vec<u32>) -> Option<String> {
    font_hints::export_font_for(points)
}

#[tauri::command]
pub fn export_fetch_image(app: tauri::AppHandle, url: String) -> Result<String, String> {
    pictures::export_fetch_image(app, url)
}

#[tauri::command]
pub fn export_use_pandoc(pandoc: Option<String>) -> Result<(), String> {
    pandoc::export_use_pandoc(pandoc)
}

#[tauri::command]
pub fn export_use_curl(curl: Option<String>) -> Result<(), String> {
    curl::export_use_curl(curl)
}

#[cfg(test)]
mod tests;
