//! Which pandoc may be run, and the one way the app runs it.
//!
//! A binary named by `YI_PANDOC` or a probe is the one used; a missing name means *no pandoc*, never
//! a different one. Every call goes through [`run_pandoc`], so the argument list and the failure
//! sentence have one home.
//!
//! May import: `std`, the shared search rule and the app's i18n. Upholds: the app never runs a
//! pandoc it did not find, and every call is made the same way.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use super::search::find_pandoc_from;

/// The known places a pandoc lives on a Mac, before `PATH` is consulted at all.
fn known_pandoc_locations() -> Vec<PathBuf> {
    vec![
        PathBuf::from("/opt/homebrew/bin/pandoc"),
        PathBuf::from("/usr/local/bin/pandoc"),
        PathBuf::from("/usr/bin/pandoc"),
    ]
}
/// The pandoc a probe has pointed the app at, if it has. `YI_PANDOC` is the same seam; this is the
/// one a caller can reach while the process is already running.
static PANDOC_FOR_TESTS: Mutex<Option<String>> = Mutex::new(None);
pub fn find_pandoc() -> (Option<PathBuf>, String) {
    let named = PANDOC_FOR_TESTS.lock().ok().and_then(|named| named.clone());
    find_pandoc_from(
        named.or_else(|| std::env::var("YI_PANDOC").ok()),
        &known_pandoc_locations(),
        std::env::var("PATH").ok(),
    )
}
/// Points the app at another pandoc — `YI_PANDOC`, as a call, for a probe, which cannot change the
/// environment of the process it is driving. `None` puts the app back to looking for one.
///
/// Only a debug build is listenable: choosing the binary this app runs is a test's business, never
/// a shipped app's, so a release build answers with a refusal.
pub fn export_use_pandoc(pandoc: Option<String>) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err(crate::i18n::now("export.debugOnly", &[("what", "pandoc")]));
    }
    let mut named = PANDOC_FOR_TESTS
        .lock()
        .map_err(|_| "The pandoc seam is unusable.".to_string())?;
    *named = pandoc.filter(|value| !value.trim().is_empty());
    Ok(())
}
/// Runs pandoc, and answers with *its* sentence when it fails: a missing bibliography, a bad key in
/// the defaults file and a destination that cannot be written each say something only pandoc knows.
///
/// What it says on the way *without* failing is kept too — a picture it could not fetch, a citation
/// it could not resolve: those are the reasons a document is not quite what the reader asked for,
/// and the window says them rather than leaving the reader to notice the hole.
pub(super) fn run_pandoc(
    pandoc: &Path,
    arguments: &[OsString],
    working_dir: Option<&Path>,
) -> Result<Vec<String>, String> {
    let mut command = Command::new(pandoc);
    if let Some(dir) = working_dir.filter(|dir| dir.is_dir()) {
        command.current_dir(dir);
    }
    let output = command
        .args(arguments)
        .output()
        .map_err(|error| {
            crate::i18n::now(
                "app.cannotRun",
                &[("program", &pandoc.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
    if !output.status.success() {
        let complaint = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if complaint.is_empty() {
            format!("{} failed", pandoc.display())
        } else {
            complaint
        });
    }
    Ok(warnings_in(&String::from_utf8_lossy(&output.stderr)))
}

/// The lines pandoc wrote that are not blank: its warnings, one sentence each.
pub(super) fn warnings_in(stderr: &str) -> Vec<String> {
    stderr
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        // Pandoc decorates each warning with `[WARNING]` for a log's sake; the reader is looking at
        // a card that *is* the warning, so the decoration comes off.
        .map(|line| line.strip_prefix("[WARNING] ").unwrap_or(line).to_string())
        .collect()
}
