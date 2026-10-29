use super::*;
use std::fs;
use std::path::PathBuf;

pub(super) use super::config::{ensure_csl_in, ensure_defaults_in, style_file_name, CslStyle};
pub(super) use super::font_hints::named_fonts;
pub(super) use super::info::kind_info;
pub(super) use super::kinds::{config_file_name, kind_of, ExportKind};
pub(super) use super::pandoc::warnings_in;
pub(super) use super::odt_toc::{cache_contents, with_cached_contents};
pub(super) use super::pictures::{download_image, image_extension, remote_file_name};
pub(super) use super::run::{
    deliver_html_assets, deliver_latex_assets, deliver_note_assets, pandoc_arguments,
    NativeBibliography, NoteAsset,
};
pub(super) use super::templates::{reference_to, safe_prefix};
pub(super) use super::search::find_pandoc_from;

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("yi-export-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

mod config;
mod font_hints;
mod kinds;
mod odt_toc;
mod pandoc;
mod pictures;
mod revealjs;
mod run;
