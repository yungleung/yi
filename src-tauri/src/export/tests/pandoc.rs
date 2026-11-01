#[test]
fn a_pandoc_named_by_the_test_seam_is_the_one_that_is_run() {
    let here = std::env::current_exe().unwrap();
    let (found, source) = find_pandoc_from(
        Some(here.to_string_lossy().into_owned()),
        &[],
        Some("/nowhere".to_string()),
    );
    assert_eq!(found.as_deref(), Some(here.as_path()));
    assert_eq!(source, "env");
}

#[test]
fn a_named_pandoc_that_is_not_there_means_no_pandoc_at_all() {
    // Not a fallback to a found one: a probe asks for the machine that has none this way.
    let (found, source) = find_pandoc_from(
        Some("/definitely/not/pandoc".to_string()),
        &[std::env::current_exe().unwrap()],
        Some("/bin".to_string()),
    );
    assert!(found.is_none());
    assert_eq!(source, "env-missing");
}

#[test]
fn a_known_place_is_searched_before_the_shells_path() {
    let known = std::env::current_exe().unwrap();
    let (found, source) = find_pandoc_from(None, &[known.clone()], Some("/bin".to_string()));
    assert_eq!(found, Some(known));
    assert_eq!(source, "known-0");
}

#[test]
fn and_a_machine_with_neither_answers_nothing() {
    let (found, source) = find_pandoc_from(None, &[], Some("/nowhere".to_string()));
    assert!(found.is_none());
    assert!(source.is_empty());
}
#[test]
fn what_pandoc_says_on_the_way_is_kept_line_by_line() {
    let stderr = "[WARNING] Could not fetch resource https://x/y.png: no\n\n\
             [WARNING] Citeproc: citation smith2020 not found\n";
    assert_eq!(
        warnings_in(stderr),
        vec![
            "Could not fetch resource https://x/y.png: no".to_string(),
            "Citeproc: citation smith2020 not found".to_string(),
        ]
    );
    assert!(warnings_in("").is_empty());
}

use super::*;
