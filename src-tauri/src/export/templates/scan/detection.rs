//! What an already-listed template source means: its entry, kind, mode, assets and warnings.
//!
//! May import: std, the scan file vocabulary and source readers. Upholds: entry ranking, ambiguity
//! and kind suggestions remain identical to the import inspector.

use super::source::{read_file, read_text, source_type};
use super::{ScannedFile, TemplateKind, TemplateMode};
use std::fs;
use std::path::Path;

/// The complete meaning of a source's file list.
pub(super) struct Detection {
    pub kind: TemplateKind,
    pub entry: String,
    pub mode: TemplateMode,
    pub assets: Vec<String>,
    pub deliver: Vec<String>,
    pub warnings: Vec<String>,
    pub suggested_kind: Option<String>,
    pub csl: Option<String>,
    pub entry_candidates: Vec<String>,
    pub ambiguous_entry: bool,
}

/// Detects the entry, kind and package files carried by an already-listed source.
pub(super) fn detect(source: &Path, files: &[ScannedFile]) -> Result<Detection, String> {
    let names: Vec<String> = files.iter().map(|file| file.name.clone()).collect();

    let tex: Vec<String> = names
        .iter()
        .filter(|name| has_extension(name, "tex"))
        .cloned()
        .collect();
    let html: Vec<String> = names
        .iter()
        .filter(|name| has_extension(name, "html") || has_extension(name, "xhtml"))
        .cloned()
        .collect();
    let reference: Vec<String> = names
        .iter()
        .filter(|name| has_extension(name, "docx") || has_extension(name, "odt"))
        .cloned()
        .collect();
    let labels: Vec<String> = names
        .iter()
        .filter(|name| has_extension(name, "csl"))
        .cloned()
        .collect();
    let defaults: Vec<String> = names
        .iter()
        .filter(|name| has_extension(name, "yaml") || has_extension(name, "yml"))
        .cloned()
        .collect();

    let mut warnings = Vec::new();
    let mut entry_candidates;
    let ambiguous_entry;
    let (entry, mode, kind, suggested_kind) = if !tex.is_empty() {
        let scored = score_tex(source, &tex)?;
        let best_score = scored[0].score;
        let best: Vec<&ScoredTex> = scored
            .iter()
            .filter(|scored| scored.score == best_score)
            .collect();
        ambiguous_entry = best.len() > 1;
        entry_candidates = sorted_tex_candidates(&scored, source)?;
        let entry = best
            .iter()
            .max_by_key(|scored| scored.size)
            .map(|scored| scored.name.clone())
            .unwrap_or_else(|| tex[0].clone());
        let text = read_text(source, &entry).unwrap_or_default();
        let mode = mode_for_tex(&text);
        if mode == TemplateMode::Template && !text.contains("$body$") {
            warnings.push(crate::i18n::now("template.noBody", &[]));
        }
        if mode == TemplateMode::Wrapper {
            warnings.push(crate::i18n::now("template.wrapperNeeded", &[]));
        }
        let kind = if reference.is_empty() {
            TemplateKind::Template
        } else {
            warnings.push(crate::i18n::now("template.alsoReference", &[]));
            entry_candidates.extend(reference.iter().cloned());
            TemplateKind::Ambiguous
        };
        (entry, mode, kind, Some("latex".to_string()))
    } else if !html.is_empty() {
        let entry = largest(source, &html)?;
        let text = read_text(source, &entry).unwrap_or_default();
        if !text.contains("$body$") {
            warnings.push(crate::i18n::now("template.noBody", &[]));
        }
        entry_candidates = html.clone();
        ambiguous_entry = html.len() > 1;
        if !reference.is_empty() {
            entry_candidates.extend(reference.iter().cloned());
        }
        let suggested = if has_extension(&entry, "xhtml") {
            "epub"
        } else {
            "html"
        };
        (
            entry,
            TemplateMode::Template,
            if reference.is_empty() {
                TemplateKind::Template
            } else {
                TemplateKind::Ambiguous
            },
            Some(suggested.to_string()),
        )
    } else if !reference.is_empty() {
        let entry = largest(source, &reference)?;
        entry_candidates = reference.clone();
        ambiguous_entry = reference.len() > 1;
        (
            entry,
            TemplateMode::ReferenceDoc,
            TemplateKind::ReferenceDoc,
            Some(extension_kind(source, &reference[0]).to_string()),
        )
    } else if !labels.is_empty() {
        return Err(crate::i18n::now("template.loneCsl", &[]));
    } else if !defaults.is_empty() {
        return Err(crate::i18n::now("template.loneDefaults", &[]));
    } else {
        return Err(crate::i18n::now("template.noEntry", &[]));
    };

    let csl = labels.first().cloned();
    if labels.len() > 1 {
        warnings.push(crate::i18n::now(
            "template.manyCsl",
            &[("files", &labels.join(", "))],
        ));
    }
    if source_type(source) == "file" && suggested_kind.is_none() {
        return Err(crate::i18n::now("template.noEntry", &[]));
    }
    let assets: Vec<String> = names
        .iter()
        .filter(|name| *name != &entry && Some(*name) != csl.as_ref())
        .cloned()
        .collect();
    let deliver = deliver_for(suggested_kind.as_deref(), &assets);

    Ok(Detection {
        kind,
        entry,
        mode,
        assets,
        deliver,
        warnings,
        suggested_kind,
        csl,
        entry_candidates,
        ambiguous_entry,
    })
}

fn has_extension(name: &str, extension: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(extension))
}

fn extension_kind(_source: &Path, name: &str) -> &'static str {
    if has_extension(name, "odt") {
        "odt"
    } else {
        "docx"
    }
}

struct ScoredTex {
    name: String,
    score: u8,
    size: u64,
}

fn score_tex(source: &Path, tex: &[String]) -> Result<Vec<ScoredTex>, String> {
    let mut scored = Vec::new();
    for name in tex {
        let text = read_text(source, name).unwrap_or_default();
        let score = if text.contains("$body$") {
            4
        } else if text.contains("\\begin{document}") && text.contains("\\end{document}") {
            3
        } else if matches!(
            Path::new(name).file_name().and_then(|name| name.to_str()),
            Some("main.tex" | "template.tex" | "article.tex")
        ) {
            2
        } else {
            1
        };
        scored.push(ScoredTex {
            name: name.clone(),
            score,
            size: file_size(source, name),
        });
    }
    scored.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| right.size.cmp(&left.size))
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(scored)
}

fn sorted_tex_candidates(scored: &[ScoredTex], _source: &Path) -> Result<Vec<String>, String> {
    Ok(scored.iter().map(|scored| scored.name.clone()).collect())
}

fn file_size(source: &Path, name: &str) -> u64 {
    if source.is_dir() {
        return fs::metadata(source.join(name))
            .map(|metadata| metadata.len())
            .unwrap_or(0);
    }
    if source_type(source) == "zip" {
        return read_file(source, name)
            .map(|bytes| bytes.len() as u64)
            .unwrap_or(0);
    }
    fs::metadata(source)
        .map(|metadata| metadata.len())
        .unwrap_or(0)
}

fn largest(source: &Path, names: &[String]) -> Result<String, String> {
    names
        .iter()
        .max_by_key(|name| (file_size(source, name), std::cmp::Reverse((*name).clone())))
        .cloned()
        .ok_or_else(|| crate::i18n::now("template.noEntry", &[]))
}

fn mode_for_tex(text: &str) -> TemplateMode {
    if text.contains("$body$") {
        TemplateMode::Template
    } else if text.contains("\\begin{document}") && text.contains("\\end{document}") {
        TemplateMode::Wrapper
    } else {
        TemplateMode::Template
    }
}

/// The files a LaTeX export must carry beside its `.tex` for the reader's own compile.
pub(crate) fn deliver_for(kind: Option<&str>, assets: &[String]) -> Vec<String> {
    if kind != Some("latex") {
        return Vec::new();
    }
    assets
        .iter()
        .filter(|name| {
            ["cls", "sty", "bst", "bbx", "cbx"]
                .iter()
                .any(|extension| has_extension(name, extension))
        })
        .cloned()
        .collect()
}
