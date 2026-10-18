//! The search order shared by the external programs an export may run.
//!
//! A program named by the environment or a probe is the one used, and a name that is missing is an
//! answer rather than a fallback. Otherwise the known places are tried before the shell's `PATH`.
//!
//! May import: `std`. Upholds: one search order for every external program, so a named binary is
//! never silently replaced by a different one.

use std::path::PathBuf;

/// Where pandoc was found, and how. A function of its arguments, so the search order can be tested
/// without a machine to test it on.
pub(super) fn find_pandoc_from(
    from_env: Option<String>,
    known: &[PathBuf],
    path: Option<String>,
) -> (Option<PathBuf>, String) {
    if let Some(value) = from_env.filter(|value| !value.trim().is_empty()) {
        let named = PathBuf::from(value);
        // A name that is not there is an answer, not a fallback: a pandoc named and quietly not run
        // would not be the pandoc that was named. It is also how a probe asks the app for the
        // machine that has no pandoc at all (`test/probes/export-no-pandoc.js`).
        return if named.exists() {
            (Some(named), "env".to_string())
        } else {
            (None, "env-missing".to_string())
        };
    }
    for (index, candidate) in known.iter().enumerate() {
        if candidate.exists() {
            return (Some(candidate.clone()), format!("known-{index}"));
        }
    }
    // Only now the shell's `PATH`.
    if let Some(entries) = path {
        for entry in std::env::split_paths(&entries) {
            let candidate = entry.join("pandoc");
            if candidate.exists() {
                return (Some(candidate), "path".to_string());
            }
        }
    }
    (None, String::new())
}
