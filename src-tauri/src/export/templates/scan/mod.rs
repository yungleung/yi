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

#[cfg(test)]
use source::list_files;
#[allow(unused_imports)]
pub(super) use source::{copy_into, read_file, relative, source_type, MAX_BYTES, MAX_FILES};
pub(super) use detection::deliver_for;

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
            .map(|text| wrapper_for(&detection.entry, &text, detection.mode))
            .transpose()?
            .flatten(),
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

fn wrapper_for(
    source_entry: &str,
    text: &str,
    mode: TemplateMode,
) -> Result<Option<WrapperProposal>, String> {
    if mode != TemplateMode::Wrapper {
        return Ok(None);
    }
    let Some((preview, line)) = insert_body(text) else {
        return Ok(None);
    };
    Ok(Some(WrapperProposal {
        source_entry: source_entry.to_string(),
        entry: wrapper_entry(source_entry),
        insertion: crate::i18n::now(
            "template.insertBeforeEnd",
            &[("line", &line.to_string())],
        ),
        preview,
        maps_title: has_command(text, "\\title"),
        maps_author: has_command(text, "\\author"),
    }))
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
