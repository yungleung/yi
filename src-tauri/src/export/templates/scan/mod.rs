//! Looking at a template source before any of it is copied: what kind it is, which file is its
//! entry, and every file that would travel with it.
//
// A source is one file, a folder or a zip. Inspection reads no more than detection needs, so a
// 200 MB kit can be proposed without being staged first; the import itself asks this module to
// extract the same listing, with the same safety rules.
//!
// May import: `std`, `serde` and the zip reader. Upholds: every file a package would receive is a
// regular file inside the source, named by a relative path that cannot leave the package.

use serde::Serialize;
use std::path::Path;
#[cfg(test)]
use std::fs;
#[cfg(test)]
use std::path::PathBuf;

use super::super::kinds::TemplateMode;

mod archive;
mod detection;
mod source;
mod wrapper;

#[cfg(test)]
use source::list_files;
#[allow(unused_imports)]
pub(super) use source::{copy_into, read_file, relative, source_type, MAX_BYTES, MAX_FILES};
pub(super) use detection::deliver_for;
pub(super) use wrapper::{insert_body, replace_argument, wrapper_entry, wrapper_source};

/// What a source looks like before the reader says which export kind it is for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TemplateKind {
    Template,
    ReferenceDoc,
    Ambiguous,
}

/// One file inspection found.
#[derive(Debug, Clone, Serialize)]
pub struct ScannedFile {
    pub name: String,
    pub size: u64,
}

/// The wrapper this source proposes when its main TeX file has a document environment but no
/// `$body$`: the original kept as an asset, and a copy with the body inserted.
#[derive(Debug, Clone, Serialize)]
pub struct WrapperProposal {
    pub source_entry: String,
    pub entry: String,
    pub insertion: String,
    /// The whole proposed entry, so the reader can read it before the package is written.
    pub preview: String,
    pub maps_title: bool,
    pub maps_author: bool,
}

/// What inspection says the package would be.
#[derive(Debug, Clone, Serialize)]
pub struct ScannedSource {
    pub kind: TemplateKind,
    pub entry: String,
    pub mode: TemplateMode,
    pub assets: Vec<String>,
    pub deliver: Vec<String>,
    pub warnings: Vec<String>,
    pub source_type: String,
    /// The export kind the entry would fit best, for the confirmation form's first answer.
    pub suggested_kind: Option<String>,
    pub csl: Option<String>,
    /// Every plausible entry, so the reader can correct a choice the scan could not make.
    pub entry_candidates: Vec<String>,
    pub ambiguous_entry: bool,
    pub wrapper: Option<WrapperProposal>,
    pub files: Vec<ScannedFile>,
}

/// Inspects a source without copying it.
pub(super) fn inspect(source: &Path) -> Result<ScannedSource, String> {
    if !source.exists() {
        return Err(crate::i18n::now(
            "template.sourceMissing",
            &[("path", &source.display().to_string())],
        ));
    }
    let files = source::list_files(source)?;
    let detection = detection::detect(source, &files)?;
    let wrapper = match detection.mode {
        TemplateMode::Wrapper => source::read_text(source, &detection.entry)
            .ok()
            .map(|text| wrapper::proposal(&detection.entry, &text))
            .transpose()?,
        _ => None,
    };

    Ok(ScannedSource {
        kind: detection.kind,
        entry: detection.entry,
        mode: detection.mode,
        assets: detection.assets,
        deliver: detection.deliver,
        warnings: detection.warnings,
        source_type: source::source_type(source).to_string(),
        suggested_kind: detection.suggested_kind,
        csl: detection.csl,
        entry_candidates: detection.entry_candidates,
        ambiguous_entry: detection.ambiguous_entry,
        wrapper,
        files,
    })
}

#[cfg(test)]
mod tests;
