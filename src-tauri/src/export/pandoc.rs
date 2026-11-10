//! Which pandoc may be run, and the one way the app runs it.
//!
//! A binary named by `YI_PANDOC` or a probe is the one used; a missing name means *no pandoc*, never
//! a different one. Every call goes through [`run_pandoc`], so the argument list and the failure
//! sentence have one home.
//!
//! May import: `std`, the shared search rule and the app's i18n. Upholds: the app never runs a
//! pandoc it did not find, and every call is made the same way.

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use super::search::find_pandoc_from;

/// The known places pandoc lives on each desktop, before `PATH` is consulted at all.
fn known_pandoc_locations() -> Vec<PathBuf> {
    let mut locations = Vec::new();
    if cfg!(target_os = "macos") {
        locations.push(PathBuf::from("/opt/homebrew/bin/pandoc"));
        locations.push(PathBuf::from("/usr/local/bin/pandoc"));
        locations.push(PathBuf::from("/usr/bin/pandoc"));
    } else if cfg!(target_os = "windows") {
        if let Some(local) = dirs::data_local_dir() {
            locations.push(local.join("Pandoc/pandoc.exe"));
        }
        if let Some(program_files) = std::env::var_os("ProgramFiles") {
            locations.push(PathBuf::from(program_files).join("Pandoc/pandoc.exe"));
        }
    } else {
        if let Some(home) = dirs::home_dir() {
            locations.push(home.join(".local/bin/pandoc"));
        }
        locations.push(PathBuf::from("/usr/local/bin/pandoc"));
        locations.push(PathBuf::from("/usr/bin/pandoc"));
        locations.push(PathBuf::from("/snap/bin/pandoc"));
    }
    locations
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
///
/// Example: a successful run with stderr `"[WARNING] Missing image"` returns
/// `["Missing image"]`; a nonzero exit returns pandoc's stderr as the error.
pub(super) fn run_pandoc(
    pandoc: &Path,
    arguments: &[OsString],
    working_dir: Option<&Path>,
) -> Result<Vec<String>, String> {
    run_pandoc_with_env(pandoc, arguments, working_dir, &[])
}

/// The same run with environment variables the TeX engine needs — chiefly `TEXINPUTS` for a
/// template package whose entry lives in a subfolder but whose class lives at the package root.
pub(super) fn run_pandoc_with_env(
    pandoc: &Path,
    arguments: &[OsString],
    working_dir: Option<&Path>,
    environment: &[(&str, OsString)],
) -> Result<Vec<String>, String> {
    let output = pandoc_output(pandoc, arguments, working_dir, environment)?;
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

/// Runs pandoc for the answer on its standard output rather than for one of its writers: the
/// default template (`--print-default-template`) and the default reference document
/// (`--print-default-data-file`) are both pandoc's to produce.
pub(super) fn run_pandoc_bytes(
    pandoc: &Path,
    arguments: &[OsString],
    working_dir: Option<&Path>,
) -> Result<Vec<u8>, String> {
    let output = pandoc_output(pandoc, arguments, working_dir, &[])?;
    if !output.status.success() {
        let complaint = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if complaint.is_empty() {
            format!("{} failed", pandoc.display())
        } else {
            complaint
        });
    }
    Ok(output.stdout)
}

/// Whether a Pandoc version is new enough for the bundled theorem filter.
///
/// Example: `pandoc 3.1.0` is refused while `pandoc 3.1.1` and `pandoc 3.12.1` are accepted.
pub(super) fn theorem_versions_supported(version_output: &str) -> bool {
    let version = version_output
        .lines()
        .next()
        .and_then(|line| line.strip_prefix("pandoc "))
        .and_then(|value| value.split_whitespace().next());
    let Some(version) = version else {
        return false;
    };
    let parts = version
        .split('.')
        .take(3)
        .map(|part| part.parse::<u64>().ok())
        .collect::<Option<Vec<_>>>();
    matches!(
        parts,
        Some(parts)
            if parts.get(0).copied().unwrap_or(0) > 3
                || (parts.get(0).copied().unwrap_or(0) == 3
                    && parts.get(1).copied().unwrap_or(0) > 1)
                || (parts.get(0).copied().unwrap_or(0) == 3
                    && parts.get(1).copied().unwrap_or(0) == 1
                    && parts.get(2).copied().unwrap_or(0) >= 1)
    )
}

/// Refuses an installed Pandoc older than the theorem filter supports.
pub(super) fn require_theorem_pandoc(pandoc: &Path) -> Result<(), String> {
    let output = run_pandoc_bytes(pandoc, &[OsString::from("--version")], None)?;
    let text = String::from_utf8_lossy(&output);
    if theorem_versions_supported(&text) {
        Ok(())
    } else {
        Err(crate::i18n::now("export.theoremPandocTooOld", &[]))
    }
}

fn pandoc_output(
    pandoc: &Path,
    arguments: &[OsString],
    working_dir: Option<&Path>,
    environment: &[(&str, OsString)],
) -> Result<std::process::Output, String> {
    let mut command = Command::new(pandoc);
    if let Some(path) = path_with_program_dir(pandoc, std::env::var_os("PATH").as_deref()) {
        command.env("PATH", path);
    }
    if let Some(dir) = working_dir.filter(|dir| dir.is_dir()) {
        command.current_dir(dir);
    }
    command.envs(environment.iter().map(|(name, value)| (*name, value)));
    command.args(arguments).output().map_err(|error| {
        crate::i18n::now(
            "app.cannotRun",
            &[
                ("program", &pandoc.display().to_string()),
                ("reason", &error.to_string()),
            ],
        )
    })
}

/// Prepends pandoc's own folder to `PATH`, so an engine installed beside it is found when the
/// desktop launcher did not inherit the reader's shell path.
///
/// Example: a user-local `/home/me/.local/bin/pandoc` makes that folder the first place its
/// `xelatex` lookup searches, while every existing PATH entry remains available.
pub(super) fn path_with_program_dir(program: &Path, current: Option<&OsStr>) -> Option<OsString> {
    let directory = program.parent()?;
    let entries = current.into_iter().flat_map(std::env::split_paths);
    std::env::join_paths(std::iter::once(directory.to_path_buf()).chain(entries)).ok()
}

/// The lines pandoc wrote that are not blank: its warnings, one sentence each.
///
/// Example: `warnings_in("[WARNING] Lost image\n\n")` returns `["Lost image"]`.
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
