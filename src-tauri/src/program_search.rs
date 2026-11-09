//! Finds a named executable in a PATH string.
//!
//! Example: on Windows, `find_in_path("pandoc", path, ".exe")` accepts a
//! `pandoc.exe` entry while the same helper on macOS uses an empty suffix.
//!
//! May import: standard path and environment APIs. Upholds: every external
//! program is resolved by the same platform-aware path rule.

use std::path::PathBuf;

/// Every matching executable candidate on `path`, in PATH order.
pub(crate) fn candidates_in_path(program: &str, path: &str, suffix: &str) -> Vec<PathBuf> {
    let mut found = Vec::new();
    for entry in std::env::split_paths(path) {
        let plain = entry.join(program);
        if plain.exists() {
            found.push(plain);
        }
        if !suffix.is_empty() {
            let with_suffix = entry.join(format!("{program}{suffix}"));
            if with_suffix.exists() && !found.contains(&with_suffix) {
                found.push(with_suffix);
            }
        }
    }
    found
}

/// The first matching executable on `path`.
pub(crate) fn find_in_path(program: &str, path: &str, suffix: &str) -> Option<PathBuf> {
    candidates_in_path(program, path, suffix).into_iter().next()
}
