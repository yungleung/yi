#[test]
fn git_from_the_environment_wins_over_every_other_place() {
    let directory = std::env::temp_dir().join("yi-versioning-named-git");
    let _ = fs::remove_dir_all(&directory);
    fs::create_dir_all(&directory).unwrap();
    let named = directory.join("git");
    fs::write(&named, "").unwrap();

    let (found, source) = find_git_from(
        Some(named.to_string_lossy().into_owned()),
        true,
        &[PathBuf::from("/opt/homebrew/bin/git")],
        Some("/usr/bin".to_string()),
    );
    assert_eq!(found, Some(named));
    assert_eq!(source, "env");
    let _ = fs::remove_dir_all(&directory);
}

#[test]
fn a_named_git_that_is_not_there_is_no_git_at_all() {
    let (found, source) = find_git_from(
        Some("/nowhere/yi-git".to_string()),
        true,
        &[PathBuf::from("/opt/homebrew/bin/git")],
        Some("/usr/bin".to_string()),
    );
    assert_eq!(found, None);
    assert_eq!(source, "env-missing");
}

#[test]
fn the_rows_are_read_from_gits_own_separators() {
    let output = "\u{1e}abc\u{0}1790855254\u{0}The note · 2026-10-01 20:15\u{0}why I rewrote it\n\nrenamed.md\n\
                      \u{1e}def\u{0}1790855300\u{0}Another\u{0}\n\nnote.md\n";
    let rows = versions_from(output);
    assert_eq!(rows.len(), 2, "{rows:?}");
    assert_eq!(rows[0].hash, "abc");
    assert_eq!(rows[0].at, 1790855254);
    assert_eq!(rows[0].subject, "The note · 2026-10-01 20:15");
    assert_eq!(rows[0].body, "why I rewrote it");
    assert_eq!(rows[0].path, "renamed.md");
    assert_eq!(rows[1].subject, "Another");
    assert_eq!(
        rows[1].body, "",
        "a commit with no body has an empty one, not a missing field"
    );
    assert_eq!(rows[1].path, "note.md");
    assert!(
        versions_from("").is_empty(),
        "a path git has never seen answers nothing at all"
    );
}

#[test]
fn a_revision_or_path_that_could_be_an_option_is_refused() {
    assert!(version_text_arguments("--upload-pack=x", "note.md").is_err());
    assert!(version_text_arguments("abc123", "/etc/passwd").is_err());
    assert!(version_text_arguments("abc123", "../note.md").is_err());
    assert!(
        version_text_arguments("ab", "note.md").is_err(),
        "too short to be a hash"
    );
    assert_eq!(
        version_text_arguments("abc123", "notes/note.md").unwrap(),
        "abc123:notes/note.md"
    );
}

#[test]
fn the_system_git_is_only_trusted_when_the_command_line_tools_answer() {
    let (found, _) = find_git_from(None, false, &[], Some("/usr/bin".to_string()));
    assert_ne!(found, Some(PathBuf::from("/usr/bin/git")));
}

#[test]
fn a_worktree_repository_is_a_folder_with_a_dot_git_file() {
    let directory = std::env::temp_dir().join("yi-versioning-worktree");
    let _ = fs::remove_dir_all(&directory);
    fs::create_dir_all(&directory).unwrap();
    fs::write(directory.join(".git"), "gitdir: /elsewhere\n").unwrap();

    let shape = repository_shape(&directory);
    assert!(shape.here);
    assert!(!shape.above);
    assert_eq!(
        shape.toplevel.as_deref(),
        Some(directory.to_string_lossy().as_ref())
    );
    let _ = fs::remove_dir_all(&directory);
}

#[test]
fn a_folder_inside_a_repository_is_said_to_be_above_one() {
    let outer = std::env::temp_dir().join("yi-versioning-outer");
    let inner = outer.join("notes");
    let _ = fs::remove_dir_all(&outer);
    fs::create_dir_all(&inner).unwrap();
    fs::create_dir_all(outer.join(".git")).unwrap();

    let shape = repository_shape(&inner);
    assert!(!shape.here);
    assert!(shape.above);
    assert_eq!(
        shape.toplevel.as_deref(),
        Some(outer.to_string_lossy().as_ref())
    );
    let _ = fs::remove_dir_all(&outer);
}

#[test]
fn a_folder_with_no_repository_anywhere_above_it_says_so() {
    let plain = std::env::temp_dir().join("yi-versioning-plain");
    let _ = fs::remove_dir_all(&plain);
    fs::create_dir_all(&plain).unwrap();

    let shape = repository_shape(&plain);
    assert!(!shape.here);
    assert!(!shape.above || std::env::temp_dir().join(".git").exists());
    let _ = fs::remove_dir_all(&plain);
}

#[test]
fn the_cloud_shapes_are_read_from_the_path() {
    let home = PathBuf::from("/Users/someone");
    let drive = home.join("Library/CloudStorage/GoogleDrive-a/My Drive/notes");
    assert_eq!(cloud_kind(&drive, &home, &[]).0, "cloud-storage");

    let icloud = home.join("Library/Mobile Documents/com~apple~CloudDocs/notes");
    assert_eq!(cloud_kind(&icloud, &home, &[]).0, "icloud");

    #[cfg(windows)]
    {
        let onedrive = vec![(
            "OneDrive".to_string(),
            "C:\\Users\\someone\\OneDrive".to_string(),
        )];
        assert_eq!(
            cloud_kind(
                Path::new("C:\\Users\\someone\\OneDrive\\notes"),
                &home,
                &onedrive
            )
            .0,
            "onedrive"
        );
    }
}

#[test]
fn an_ordinary_folder_is_no_cloud_folder() {
    let plain = std::env::temp_dir().join("yi-versioning-cloud-plain");
    let _ = fs::remove_dir_all(&plain);
    fs::create_dir_all(&plain).unwrap();

    let (kind, evidence) = cloud_kind(&plain, Path::new("/Users/someone"), &[]);
    assert_eq!(kind, "none", "{evidence}");
    let _ = fs::remove_dir_all(&plain);
}

/// What the app may ask git to do, held to by a git that only records.
///
/// A probe cannot write an executable (`test/probes/versioning-fake-git.js` says why it points
/// the app at the committed one instead), so the vocabulary is proven here, where the app's own
/// hand is: every argument the app writes is read back and checked against the never-list.
#[cfg(unix)]
mod vocabulary {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    /// A git that records one line per call — every argument, in order — and does nothing else.
    fn recording_git(directory: &Path) -> PathBuf {
        let script = directory.join("fake-git");
        fs::write(
            &script,
            format!(
                "#!/bin/sh\nprintf 'git %s\\n' \"$*\" >> {}\nexit 0\n",
                directory.join("argv.log").display()
            ),
        )
        .unwrap();
        let mut permissions = fs::metadata(&script).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&script, permissions).unwrap();
        script
    }

    #[test]
    fn the_app_asks_git_for_these_commands_and_no_others() {
        let directory = std::env::temp_dir().join("yi-versioning-vocabulary");
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        let git = recording_git(&directory);
        let workspace = directory.join("notes");
        fs::create_dir_all(&workspace).unwrap();
        let note = workspace.join("note.md");
        fs::write(&note, "hello\n").unwrap();
        let note = note.to_string_lossy().into_owned();

        init_repository_at(&git, &workspace, None).unwrap();
        init_repository_at(&git, &workspace, Some(&directory.join("repos/notes"))).unwrap();
        let ours = Identity {
            name: Some("Yi".to_string()),
            email: Some("yi@localhost".to_string()),
        };
        commit_at(
            &git,
            &workspace,
            &[note.clone()],
            "a version",
            None,
            Some(ours),
        )
        .unwrap();
        // Their repository: no identity of ours, so git commits under their own name.
        commit_at(
            &git,
            &workspace,
            &[note.clone()],
            "another version",
            None,
            None,
        )
        .unwrap();
        // A version the reader named: the subject stays, and their words are the body.
        commit_at(
            &git,
            &workspace,
            &[note.clone()],
            "a named version",
            Some("why I rewrote it"),
            None,
        )
        .unwrap();

        let recorded: Vec<String> = fs::read_to_string(directory.join("argv.log"))
            .unwrap()
            .lines()
            .map(str::to_string)
            .collect();
        assert_eq!(recorded.len(), 8, "{recorded:?}");
        assert!(recorded[0].ends_with(" init"), "{}", recorded[0]);
        assert!(
            recorded[1].contains("--separate-git-dir="),
            "{}",
            recorded[1]
        );
        assert!(recorded[2].contains(" add -- "), "{}", recorded[2]);
        assert!(
            recorded[3].contains(" commit -m a version -- "),
            "{}",
            recorded[3]
        );
        assert!(!recorded[4].contains(" -c "), "{}", recorded[4]);
        assert!(!recorded[5].contains(" -c "), "{}", recorded[5]);
        assert!(
            recorded[7].contains(" commit -m a named version -m why I rewrote it -- "),
            "{}",
            recorded[7]
        );

        // The read is the fourth call, and the only one that takes none of the repository
        // away: one file's history, through the same helper.
        read_versions(&git, &workspace, &note, 50).unwrap();
        let recorded: Vec<String> = fs::read_to_string(directory.join("argv.log"))
            .unwrap()
            .lines()
            .map(str::to_string)
            .collect();
        assert_eq!(recorded.len(), 9, "{recorded:?}");
        assert!(
            recorded[8].contains(
                " log --follow --name-only --max-count=50 --format=%x1e%H%x00%at%x00%s%x00%b -- "
            ),
            "{}",
            recorded[8]
        );
        assert!(
            recorded[8].ends_with(&format!(" -- {note}")),
            "{}",
            recorded[8]
        );

        // One version's own text, by the name it had at that commit.
        read_version_text(&git, &workspace, "abc123", "note.md").unwrap();
        let recorded: Vec<String> = fs::read_to_string(directory.join("argv.log"))
            .unwrap()
            .lines()
            .map(str::to_string)
            .collect();
        assert_eq!(recorded.len(), 10, "{recorded:?}");
        assert!(
            recorded[9].ends_with(" show abc123:note.md"),
            "{}",
            recorded[9]
        );

        // The never-list: no argument the app writes is ever one of these, anywhere.
        let never = [
            "fetch", "pull", "gc", "clean", "reset", "checkout", "switch", "amend", "force",
            "--hard",
        ];
        for line in &recorded {
            for argument in line.split_whitespace() {
                let word = argument.trim_start_matches('-');
                assert!(!never.contains(&word), "{line}");
            }
        }
        let _ = fs::remove_dir_all(&directory);
    }
}
#[cfg(unix)]
use super::*;
use std::fs;
use std::path::{Path, PathBuf};

use super::facts::{cloud_kind, repository_shape};
use super::git::find_git_from;
#[cfg(unix)]
use super::git::{commit_at, init_repository_at};
#[cfg(unix)]
use super::versions::{read_version_text, read_versions};
use super::versions::{version_text_arguments, versions_from};
