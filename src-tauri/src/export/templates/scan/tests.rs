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

// Source and detection

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
    assert!(
        scanned
            .entry_candidates
            .contains(&"journal.docx".to_string())
    );
    let _ = fs::remove_dir_all(folder);
}

// Wrapper conversion

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

// Archive safety

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
