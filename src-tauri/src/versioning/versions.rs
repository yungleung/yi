//! Reading a note's versions: its commits newest first, and one version's own text.
//!
//! The revision expression is checked before it reaches git, and version text is read as bytes so a
//! restore cannot corrupt a file through a lossy conversion.
//!
//! May import: `std`, the git seam and the app's i18n. Upholds: a version is read, never written, and
//! a caller's revision or path cannot become an option or leave the repository.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

use super::git::{git_to_run, run_git};

/// One version of a file: a commit that touched it, whoever wrote the commit.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct Version {
    pub hash: String,
    /// Unix seconds, the author's date — the one `git log` prints first, so the app's list and the
    /// reader's own `git log` agree about when a version was made.
    pub at: i64,
    pub subject: String,
    pub body: String,
    /// The name the file had **at this commit**, repo-relative — what `git show <revision>:<path>`
    /// needs, and the reason a renamed note's older versions can still be read.
    pub path: String,
}

/// What git is asked for: hash, author time, subject and body, NUL between fields and a record
/// separator between commits — a message may hold every *other* character, newlines included, and a
/// body is exactly that. The separator *leads*, because `--name-only` prints the path after the
/// format: a record runs from one separator to the next, its name last.
const VERSION_FORMAT: &str = "%x1e%H%x00%at%x00%s%x00%b";
/// The most rows one read may be asked for; the frontend asks for fifty.
const VERSION_LIMIT: usize = 200;

/// The rows git's own output holds, in the order it printed them (newest first).
pub(super) fn versions_from(output: &str) -> Vec<Version> {
    output
        .split('\u{1e}')
        .filter(|record| !record.trim().is_empty())
        .filter_map(|record| {
            let mut fields = record.split('\u{0}');
            let hash = fields.next()?;
            let at = fields.next()?.trim().parse().ok()?;
            let subject = fields.next()?;
            // What is left is the body, the blank line `--name-only` leaves, and the name itself.
            let rest = fields.next().unwrap_or("");
            let (body, path) = match rest.trim_end().rsplit_once('\n') {
                Some((body, name)) => (body.trim_end(), name.trim()),
                None => ("", rest.trim()),
            };
            Some(Version {
                hash: hash.to_string(),
                at,
                subject: subject.to_string(),
                body: body.to_string(),
                path: path.to_string(),
            })
        })
        .collect()
}
/// The versions of one file, newest first: the commits that touched it, who ever wrote them.
pub(super) fn read_versions(
    git: &Path,
    workspace: &Path,
    path: &str,
    limit: usize,
) -> Result<Vec<Version>, String> {
    // A caller's number is clamped rather than trusted: a bigger one would only walk more history
    // for rows nobody reads.
    let limit = limit.clamp(1, VERSION_LIMIT);
    let output = run_git(
        git,
        workspace,
        &[
            "log".to_string(),
            "--follow".to_string(),
            // The name the file had at each commit, so an older version can be read by it.
            "--name-only".to_string(),
            format!("--max-count={limit}"),
            format!("--format={VERSION_FORMAT}"),
            "--".to_string(),
            path.to_string(),
        ],
    )?;
    Ok(versions_from(&output))
}

/// The revision expression for one version's text, from a caller's two strings — checked first,
/// because this is the one place a caller's string becomes part of a git *revision expression*: an
/// argument that could be read as an option, or a path that is not inside the repository, is
/// refused rather than passed along.
pub(super) fn version_text_arguments(revision: &str, path: &str) -> Result<String, String> {
    let hash = revision.trim();
    if hash.len() < 4 || hash.len() > 40 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(crate::i18n::now("versioning.notAVersion", &[]));
    }
    let name = path.trim();
    if name.is_empty() || name.starts_with('/') || name.starts_with('-') || name.contains("..") {
        return Err(crate::i18n::now("versioning.notAVersionFile", &[]));
    }
    Ok(format!("{hash}:{name}"))
}

/// One version's own bytes, as text.
///
/// This is the one git call that does not go through `run_git`, because its answer is **bytes** and
/// `run_git` answers a `String`: a restore writes what a version held, so a lossy read would corrupt
/// the file. Bytes that are not text are refused with a sentence rather than rewritten.
pub(super) fn read_version_text(
    git: &Path,
    workspace: &Path,
    revision: &str,
    path: &str,
) -> Result<String, String> {
    let expression = version_text_arguments(revision, path)?;
    let output = Command::new(git)
        .arg("-C")
        .arg(workspace)
        .args(["show", &expression])
        .output()
        .map_err(|error| {
            crate::i18n::now(
                "app.cannotRun",
                &[
                    ("program", &git.display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        })?;
    if !output.status.success() {
        let complaint = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if complaint.is_empty() {
            crate::i18n::now("versioning.unreadable", &[])
        } else {
            complaint
        });
    }
    String::from_utf8(output.stdout).map_err(|_| crate::i18n::now("versioning.notText", &[]))
}

/// One version of one file, as text.
pub fn versioning_version_text(
    workspace: String,
    revision: String,
    path: String,
) -> Result<String, String> {
    let git = git_to_run()?;
    read_version_text(&git, Path::new(&workspace), &revision, &path)
}

/// The versions of one file, newest first.
pub fn versioning_history(
    workspace: String,
    path: String,
    limit: usize,
) -> Result<Vec<Version>, String> {
    let git = git_to_run()?;
    read_versions(&git, Path::new(&workspace), &path, limit)
}
