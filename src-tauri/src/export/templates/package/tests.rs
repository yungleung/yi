use super::*;
use std::sync::atomic::{AtomicU32, Ordering};

static NEXT: AtomicU32 = AtomicU32::new(0);

fn temp_dir() -> PathBuf {
    let folder = std::env::temp_dir().join(format!(
        "yi-template-package-{}-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::SeqCst),
        nanos()
    ));
    fs::create_dir_all(&folder).unwrap();
    folder
}

// Storage and naming

#[test]
fn an_id_with_a_separator_is_refused_before_it_is_joined() {
    let folder = temp_dir();
    assert!(package_path(&folder, "../x").is_err());
    assert!(package_path(&folder, "a/b").is_err());
    assert!(package_path(&folder, ".hidden").is_err());
    let _ = fs::remove_dir_all(folder);
}

#[test]
fn a_source_asset_name_steps_aside_when_the_name_is_taken() {
    let assets = vec!["source.tex".to_string()];
    assert_eq!(unique_asset_name(&assets, "source.tex"), "source-2.tex");
    assert_eq!(unique_asset_name(&assets, "template.tex"), "template.tex");
}

// Editor classification

#[test]
fn a_text_name_is_the_one_the_details_form_may_edit() {
    assert!(is_text_name("main.tex"));
    assert!(is_text_name("journal.cls"));
    assert!(is_text_name("template.json"));
    assert!(!is_text_name("reference.docx"));
    assert!(is_reference_entry("reference.docx"));
}

#[test]
fn a_package_file_list_says_which_files_are_editable() {
    let folder = temp_dir();
    fs::write(folder.join("template.json"), "{}").unwrap();
    fs::write(folder.join("main.tex"), "$body$").unwrap();
    fs::write(folder.join("reference.docx"), b"PK").unwrap();
    let files = package_files(&folder);
    assert!(
        files
            .iter()
            .any(|file| file.name == "main.tex" && file.editable)
    );
    assert!(
        files
            .iter()
            .any(|file| file.name == "template.json" && !file.editable)
    );
    assert!(
        files
            .iter()
            .any(|file| file.name == "reference.docx" && !file.editable)
    );
    let _ = fs::remove_dir_all(folder);
}
