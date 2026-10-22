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
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::Path;
#[cfg(test)]
use std::path::PathBuf;

use super::super::kinds::TemplateMode;

mod source;

pub(super) use source::{
    copy_into, read_file, relative, source_type, MAX_BYTES, MAX_FILES,
};
#[cfg(test)]
use source::list_files;

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
    let names: Vec<String> = files.iter().map(|file| file.name.clone()).collect();

    let tex: Vec<String> = names.iter().filter(|name| has_extension(name, "tex")).cloned().collect();
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
        let text = source::read_text(source, &entry).unwrap_or_default();
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
        let text = source::read_text(source, &entry).unwrap_or_default();
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
    if source::source_type(source) == "file" && suggested_kind.is_none() {
        return Err(crate::i18n::now("template.noEntry", &[]));
    }
    let assets: Vec<String> = names
        .iter()
        .filter(|name| *name != &entry && Some(*name) != csl.as_ref())
        .cloned()
        .collect();
    let deliver = deliver_for(suggested_kind.as_deref(), &assets);

    let wrapper = (mode == TemplateMode::Wrapper)
        .then(|| {
            let text = source::read_text(source, &entry).ok()?;
            let (preview, line) = insert_body(&text)?;
            Some(WrapperProposal {
                source_entry: entry.clone(),
                entry: wrapper_entry(&entry),
                insertion: crate::i18n::now(
                    "template.insertBeforeEnd",
                    &[("line", &line.to_string())],
                ),
                preview,
                maps_title: has_command(&text, "\\title"),
                maps_author: has_command(&text, "\\author"),
            })
        })
        .flatten();

    Ok(ScannedSource {
        kind,
        entry,
        mode,
        assets,
        deliver,
        warnings,
        source_type: source::source_type(source).to_string(),
        suggested_kind,
        csl,
        entry_candidates,
        ambiguous_entry,
        wrapper,
        files,
    })
}

fn zip_files(source: &Path) -> Result<Vec<ScannedFile>, String> {
    let file = fs::File::open(source).map_err(|error| {
        crate::i18n::now(
            "template.cannotRead",
            &[("path", &source.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| {
        crate::i18n::now(
            "template.badZip",
            &[("path", &source.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    let mut files = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| {
            crate::i18n::now(
                "template.badZip",
                &[("path", &source.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        if zip_symlink(&entry) {
            return Err(crate::i18n::now(
                "template.symlink",
                &[("path", entry.name())],
            ));
        }
        if entry.is_dir() {
            continue;
        }
        let Some(name) = zip_name(entry.name())? else {
            continue;
        };
        files.push(ScannedFile {
            name,
            size: entry.size(),
        });
    }
    strip_single_root(&mut files);
    let bytes: u64 = files.iter().map(|file| file.size).sum();
    if files.len() > MAX_FILES {
        return Err(crate::i18n::now(
            "template.tooManyFiles",
            &[("count", &files.len().to_string()), ("limit", &MAX_FILES.to_string())],
        ));
    }
    if bytes > MAX_BYTES {
        return Err(crate::i18n::now(
            "template.tooLarge",
            &[("size", &bytes.to_string()), ("limit", &MAX_BYTES.to_string())],
        ));
    }
    let mut seen = HashSet::new();
    for file in &files {
        if !seen.insert(file.name.clone()) {
            return Err(crate::i18n::now("template.duplicateFile", &[("file", &file.name)]));
        }
    }
    files.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(files)
}

fn zip_symlink<R: std::io::Read>(entry: &zip::read::ZipFile<'_, R>) -> bool {
    entry
        .unix_mode()
        .is_some_and(|mode| mode & 0o170000 == 0o120000)
}

/// A zip entry's name as a package path, or `None` for a dot-entry the package leaves out.
fn zip_name(raw: &str) -> Result<Option<String>, String> {
    if raw.is_empty() || raw.starts_with('/') || raw.contains('\\') {
        return Err(crate::i18n::now("template.badPath", &[("file", raw)]));
    }
    let mut parts = Vec::new();
    for part in raw.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return Err(crate::i18n::now("template.badPath", &[("file", raw)]));
        }
        if part.starts_with('.') {
            return Ok(None);
        }
        parts.push(part);
    }
    if parts.is_empty() {
        return Ok(None);
    }
    let name = parts.join("/");
    relative(&name)?;
    Ok(Some(name))
}

fn strip_single_root(files: &mut Vec<ScannedFile>) {
    let Some(first) = files.first() else {
        return;
    };
    let root = first.name.split('/').next().unwrap_or("");
    if root.is_empty()
        || files.iter().any(|file| {
            file.name.split('/').next() != Some(root) || !file.name.contains('/')
        })
    {
        return;
    }
    for file in files.iter_mut() {
        file.name = file
            .name
            .split_once('/')
            .map(|(_, rest)| rest.to_string())
            .unwrap_or_else(|| file.name.clone());
    }
}

fn read_zip_file(source: &Path, name: &str) -> Result<Vec<u8>, String> {
    let file = fs::File::open(source).map_err(|error| {
        crate::i18n::now(
            "template.cannotRead",
            &[("path", &source.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| {
        crate::i18n::now(
            "template.badZip",
            &[("path", &source.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    let mut found: Vec<ZipEntry> = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| {
            crate::i18n::now("template.badZip", &[("path", &source.display().to_string()), ("reason", &error.to_string())])
        })?;
        if zip_symlink(&entry) {
            return Err(crate::i18n::now("template.symlink", &[("path", entry.name())]));
        }
        if entry.is_dir() {
            continue;
        }
        if let Ok(Some(candidate)) = zip_name(entry.name()) {
            found.push(ZipEntry {
                name: candidate,
                index,
                size: entry.size(),
            });
        }
    }
    strip_found_root(&mut found);
    let found = found
        .into_iter()
        .find(|candidate| candidate.name == name)
        .ok_or_else(|| crate::i18n::now("template.cannotRead", &[("path", name), ("reason", "not in source")]))?;
    let mut entry = archive.by_index(found.index).map_err(|error| {
        crate::i18n::now("template.badZip", &[("path", &source.display().to_string()), ("reason", &error.to_string())])
    })?;
    let mut bytes = Vec::new();
    entry
        .by_ref()
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            crate::i18n::now(
                "template.cannotRead",
                &[("path", name), ("reason", &error.to_string())],
            )
        })?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(crate::i18n::now(
            "template.tooLarge",
            &[("size", &bytes.len().to_string()), ("limit", &MAX_BYTES.to_string())],
        ));
    }
    Ok(bytes)
}

struct ZipEntry {
    name: String,
    index: usize,
    size: u64,
}

fn strip_found_root(found: &mut [ZipEntry]) {
    let Some(first) = found.first() else {
        return;
    };
    let root = first.name.split('/').next().unwrap_or("").to_string();
    if root.is_empty()
        || found.iter().any(|entry| {
            entry.name.split('/').next() != Some(root.as_str()) || !entry.name.contains('/')
        })
    {
        return;
    }
    for entry in found.iter_mut() {
        entry.name = entry
            .name
            .split_once('/')
            .map(|(_, rest)| rest.to_string())
            .unwrap_or_else(|| entry.name.clone());
    }
}

fn extract_zip(source: &Path, target: &Path) -> Result<(), String> {
    let file = fs::File::open(source).map_err(|error| {
        crate::i18n::now(
            "template.cannotRead",
            &[("path", &source.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| {
        crate::i18n::now(
            "template.badZip",
            &[("path", &source.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    let mut found: Vec<ZipEntry> = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| {
            crate::i18n::now("template.badZip", &[("path", &source.display().to_string()), ("reason", &error.to_string())])
        })?;
        if zip_symlink(&entry) {
            return Err(crate::i18n::now("template.symlink", &[("path", entry.name())]));
        }
        if entry.is_dir() {
            continue;
        }
        if let Some(name) = zip_name(entry.name())? {
            found.push(ZipEntry {
                name,
                index,
                size: entry.size(),
            });
        }
    }
    strip_found_root(&mut found);
    if found.len() > MAX_FILES {
        return Err(crate::i18n::now(
            "template.tooManyFiles",
            &[("count", &found.len().to_string()), ("limit", &MAX_FILES.to_string())],
        ));
    }
    let bytes: u64 = found.iter().map(|entry| entry.size).sum();
    if bytes > MAX_BYTES {
        return Err(crate::i18n::now(
            "template.tooLarge",
            &[("size", &bytes.to_string()), ("limit", &MAX_BYTES.to_string())],
        ));
    }
    let mut seen = HashSet::new();
    for found in found {
        if !seen.insert(found.name.clone()) {
            return Err(crate::i18n::now("template.duplicateFile", &[("file", &found.name)]));
        }
        let destination = target.join(relative(&found.name)?);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                crate::i18n::now(
                    "template.cannotMake",
                    &[("path", &parent.display().to_string()), ("reason", &error.to_string())],
                )
            })?;
        }
        let mut entry = archive.by_index(found.index).map_err(|error| {
            crate::i18n::now("template.badZip", &[("path", &source.display().to_string()), ("reason", &error.to_string())])
        })?;
        let mut written = fs::File::create(&destination).map_err(|error| {
            crate::i18n::now(
                "template.cannotWrite",
                &[("path", &destination.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        let copied = std::io::copy(&mut entry.by_ref().take(MAX_BYTES + 1), &mut written).map_err(|error| {
            crate::i18n::now(
                "template.cannotWrite",
                &[("path", &destination.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
        if copied > MAX_BYTES {
            return Err(crate::i18n::now(
                "template.tooLarge",
                &[("size", &copied.to_string()), ("limit", &MAX_BYTES.to_string())],
            ));
        }
    }
    Ok(())
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
        let text = source::read_text(source, name).unwrap_or_default();
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
        return read_file(source, name).map(|bytes| bytes.len() as u64).unwrap_or(0);
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
pub(super) fn deliver_for(kind: Option<&str>, assets: &[String]) -> Vec<String> {
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

/// Copies a complete document into a pandoc template: the original's text with `$body$` inserted
/// immediately before the closing document environment.
pub(super) fn insert_body(text: &str) -> Option<(String, usize)> {
    let marker = "\\end{document}";
    // A complete LaTeX document is not yet a Pandoc template: every literal `$` is a template
    // delimiter there. `$$` emits one literal `$` through Pandoc's template engine, so math and
    // escaped dollars survive while the inserted `$body$` remains the one real variable.
    let escaped = text.replace('$', "$$");
    let offset = escaped.rfind(marker)?;
    let line = escaped[..offset].lines().count() + 1;
    let mut wrapped = String::with_capacity(escaped.len() + marker.len() + 8);
    wrapped.push_str(&escaped[..offset]);
    if !wrapped.ends_with('\n') {
        wrapped.push('\n');
    }
    wrapped.push_str("$body$\n");
    wrapped.push_str(&escaped[offset..]);
    Some((wrapped, line))
}

/// A wrapper entry beside the document it wraps, so relative inputs, graphics and bibliography
/// files keep the folder they were written against.
pub(super) fn wrapper_entry(entry: &str) -> String {
    sibling_entry(entry, "template.tex")
}

/// The original document kept beside the wrapper.
pub(super) fn wrapper_source(entry: &str) -> String {
    sibling_entry(entry, "source.tex")
}

fn sibling_entry(entry: &str, name: &str) -> String {
    Path::new(entry)
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(|parent| format!("{}/{}", parent.to_string_lossy().replace('\\', "/"), name))
        .unwrap_or_else(|| name.to_string())
}

/// Whether a TeX document gives `\title{…}` or `\author{…}` a value at all.
fn has_command(text: &str, command: &str) -> bool {
    text.find(command).is_some_and(|offset| {
        text[offset + command.len()..].trim_start().starts_with('{')
    })
}

/// Replaces one balanced `\title{…}` or `\author{…}` argument. Used by the wrapper's explicit
/// mapping, never by detection.
pub(super) fn replace_argument(text: &str, command: &str, value: &str) -> String {
    let Some(offset) = text.find(command) else {
        return text.to_string();
    };
    let after = offset + command.len();
    let rest = &text[after..];
    let Some(open) = rest.find('{') else {
        return text.to_string();
    };
    let mut depth = 0usize;
    let mut close = None;
    for (index, character) in rest[open..].char_indices() {
        match character {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    close = Some(open + index);
                    break;
                }
            }
            _ => {}
        }
    }
    let Some(close) = close else {
        return text.to_string();
    };
    let mut replaced = String::with_capacity(text.len() + value.len());
    replaced.push_str(&text[..after + open + 1]);
    replaced.push_str(value);
    replaced.push_str(&text[after + close..]);
    replaced
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as _;
    use std::sync::atomic::{AtomicU32, Ordering};

    static NEXT: AtomicU32 = AtomicU32::new(0);

    fn temp_dir() -> PathBuf {
        let folder = std::env::temp_dir().join(format!(
            "yi-template-scan-{}-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    fn write(path: &Path, text: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, text).unwrap();
    }

    #[test]
    fn a_tex_with_a_body_is_the_entry_of_a_template_package() {
        let folder = temp_dir();
        write(&folder.join("main.tex"), "<html>$body$</html>");
        let scanned = inspect(&folder).unwrap();
        assert_eq!(scanned.kind, TemplateKind::Template);
        assert_eq!(scanned.mode, TemplateMode::Template);
        assert_eq!(scanned.entry, "main.tex");
        assert_eq!(scanned.suggested_kind.as_deref(), Some("latex"));
        let _ = fs::remove_dir_all(folder);
    }

    #[test]
    fn an_xhtml_body_is_an_epub_template_entry() {
        let folder = temp_dir();
        write(
            &folder.join("template.xhtml"),
            "<html><body>$body$</body></html>",
        );
        let scanned = inspect(&folder).unwrap();
        assert_eq!(scanned.kind, TemplateKind::Template);
        assert_eq!(scanned.mode, TemplateMode::Template);
        assert_eq!(scanned.entry, "template.xhtml");
        assert_eq!(scanned.suggested_kind.as_deref(), Some("epub"));
        let _ = fs::remove_dir_all(folder);
    }

    #[test]
    fn a_complete_document_proposes_a_wrapper_and_keeps_its_original() {
        let folder = temp_dir();
        write(
            &folder.join("main.tex"),
            "\\documentclass{journal}\n\\title{A sample}\n\\begin{document}\nHello\n\\end{document}\n",
        );
        write(&folder.join("journal.cls"), "class");
        let scanned = inspect(&folder).unwrap();
        assert_eq!(scanned.mode, TemplateMode::Wrapper);
        assert_eq!(scanned.entry, "main.tex");
        assert!(scanned.assets.contains(&"journal.cls".to_string()));
        assert_eq!(scanned.deliver, vec!["journal.cls".to_string()]);
        let wrapper = scanned.wrapper.unwrap();
        assert!(wrapper.preview.contains("Hello\n$body$"));
        assert!(wrapper.maps_title);
        assert!(!wrapper.maps_author);
        let _ = fs::remove_dir_all(folder);
    }

    #[test]
    fn equal_tex_candidates_are_named_so_the_reader_can_choose() {
        let folder = temp_dir();
        write(&folder.join("a.tex"), "$body$");
        write(&folder.join("b.tex"), "$body$");
        let scanned = inspect(&folder).unwrap();
        assert!(scanned.ambiguous_entry);
        assert_eq!(scanned.entry_candidates.len(), 2);
        let _ = fs::remove_dir_all(folder);
    }

    #[test]
    fn a_docx_and_no_tex_is_a_reference_document_package() {
        let folder = temp_dir();
        fs::write(folder.join("journal.docx"), b"PK").unwrap();
        let scanned = inspect(&folder).unwrap();
        assert_eq!(scanned.kind, TemplateKind::ReferenceDoc);
        assert_eq!(scanned.mode, TemplateMode::ReferenceDoc);
        assert_eq!(scanned.suggested_kind.as_deref(), Some("docx"));
        let _ = fs::remove_dir_all(folder);
    }

    #[test]
    fn a_lone_csl_is_refused_because_a_style_is_not_a_template() {
        let folder = temp_dir();
        write(&folder.join("journal.csl"), "<style/>");
        assert!(inspect(&folder).is_err());
        let _ = fs::remove_dir_all(folder);
    }

    #[test]
    fn a_lone_defaults_file_is_refused_in_favour_of_the_defaults_panel() {
        let folder = temp_dir();
        write(&folder.join("export.yaml"), "standalone: true");
        let error = inspect(&folder).unwrap_err();
        assert!(error.to_lowercase().contains("defaults"), "{error}");
        let _ = fs::remove_dir_all(folder);
    }

    #[test]
    fn a_source_over_the_byte_limit_is_refused_before_it_is_copied() {
        let folder = temp_dir();
        let file = fs::File::create(folder.join("huge.tex")).unwrap();
        file.set_len(MAX_BYTES + 1).unwrap();
        let error = list_files(&folder).unwrap_err();
        assert!(error.contains(&MAX_BYTES.to_string()), "{error}");
        let _ = fs::remove_dir_all(folder);
    }

    #[test]
    fn a_tex_and_a_reference_document_together_are_named_as_ambiguous_with_both_entries() {
        let folder = temp_dir();
        write(&folder.join("main.tex"), "$body$");
        fs::write(folder.join("journal.docx"), b"PK").unwrap();
        let scanned = inspect(&folder).unwrap();
        assert_eq!(scanned.kind, TemplateKind::Ambiguous);
        assert!(scanned.entry_candidates.contains(&"journal.docx".to_string()));
        let _ = fs::remove_dir_all(folder);
    }

    #[test]
    fn a_wrapper_inserts_the_body_before_the_closing_document_environment() {
        let (wrapped, line) = insert_body("\\begin{document}\nHi\n\\end{document}\n").unwrap();
        assert_eq!(wrapped, "\\begin{document}\nHi\n$body$\n\\end{document}\n");
        assert_eq!(line, 3);
    }

    #[test]
    fn a_wrapper_escapes_literal_dollars_in_the_original_document() {
        let (wrapped, _line) =
            insert_body("\\begin{document}\n$\\pi$ and \\$\n\\end{document}\n").unwrap();
        assert!(wrapped.contains("$$\\pi$$"), "{wrapped}");
        assert!(wrapped.contains("\\$$"), "{wrapped}");
        assert!(wrapped.contains("$body$"), "{wrapped}");
        assert_eq!(wrapped.matches("$body$").count(), 1);
    }

    #[test]
    fn a_nested_document_wraps_beside_itself() {
        assert_eq!(wrapper_entry("samples/sigconf.tex"), "samples/template.tex");
        assert_eq!(wrapper_source("samples/sigconf.tex"), "samples/source.tex");
        assert_eq!(wrapper_entry("main.tex"), "template.tex");
    }

    #[test]
    fn an_offered_title_replacement_is_balanced_and_leaves_the_rest_alone() {
        let text = "\\title{A {nested} sample}\n\\begin{document}";
        let replaced = replace_argument(text, "\\title", "$title$");
        assert_eq!(replaced, "\\title{$title$}\n\\begin{document}");
    }

    #[test]
    fn a_zip_with_a_single_root_folder_is_read_without_that_folder() {
        let folder = temp_dir();
        let path = folder.join("kit.zip");
        let file = fs::File::create(&path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("kit/main.tex", options).unwrap();
        zip.write_all(b"$body$").unwrap();
        zip.start_file("kit/journal.cls", options).unwrap();
        zip.write_all(b"class").unwrap();
        zip.finish().unwrap();
        let scanned = inspect(&path).unwrap();
        assert_eq!(scanned.entry, "main.tex");
        assert!(scanned.assets.contains(&"journal.cls".to_string()));
        assert_eq!(read_file(&path, "journal.cls").unwrap(), b"class");
        let _ = fs::remove_dir_all(folder);
    }

    #[test]
    fn a_zip_entry_that_climbs_out_is_refused() {
        let folder = temp_dir();
        let path = folder.join("evil.zip");
        let file = fs::File::create(&path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file("../note.tex", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"$body$").unwrap();
        zip.finish().unwrap();
        assert!(inspect(&path).is_err());
        let _ = fs::remove_dir_all(folder);
    }

    #[test]
    fn a_folder_symlink_is_refused() {
        let folder = temp_dir();
        let outside = folder.join("outside");
        write(&outside.join("note.tex"), "$body$");
        let kit = folder.join("kit");
        fs::create_dir_all(&kit).unwrap();
        std::os::unix::fs::symlink(&outside, kit.join("linked")).unwrap();
        assert!(inspect(&kit).is_err());
        let _ = fs::remove_dir_all(folder);
    }
}
