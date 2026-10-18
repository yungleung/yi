//! Which curl may be run, and the one list of arguments it is given.
//!
//! Fetching a picture is the app's, not pandoc's: the curl this finds is named by `YI_CURL` or a
//! probe, then by the known places and `PATH`. Every call goes through [`run_curl`].
//!
//! May import: `std`, the shared search rule and the app's i18n. Upholds: one curl call shape, with
//! no upload, credentials or cookie jar.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use super::search::find_pandoc_from;

/// The known places a curl lives on a Mac. It is a system tool: `/usr/bin/curl` is there on every
/// machine this app runs on, and no other path is worth guessing at.
fn known_curl_locations() -> Vec<PathBuf> {
    vec![
        PathBuf::from("/usr/bin/curl"),
        PathBuf::from("/opt/homebrew/bin/curl"),
    ]
}
/// The curl a probe has pointed the app at, if it has — `YI_CURL` and [`export_use_curl`], the same
/// pair the pandoc seam has.
static CURL_FOR_TESTS: Mutex<Option<String>> = Mutex::new(None);
pub fn find_curl() -> (Option<PathBuf>, String) {
    let named = CURL_FOR_TESTS.lock().ok().and_then(|named| named.clone());
    find_pandoc_from(
        named.or_else(|| std::env::var("YI_CURL").ok()),
        &known_curl_locations(),
        std::env::var("PATH").ok(),
    )
}
/// Points the app at another curl — `YI_CURL`, as a call, for a probe. `None` puts it back.
pub fn export_use_curl(curl: Option<String>) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err(crate::i18n::now("export.debugOnly", &[("what", "curl")]));
    }
    let mut named = CURL_FOR_TESTS
        .lock()
        .map_err(|_| "The curl seam is unusable.".to_string())?;
    *named = curl.filter(|value| !value.trim().is_empty());
    Ok(())
}
/// The whole of what the app asks curl to do: fetch one URL into one file, following redirects,
/// refusing a status that is not a document, answering what the server called the thing it sent, and
/// giving up rather than hanging — and nothing else. No upload, no credentials, no cookie jar.
///
/// Every curl call the app makes goes through here, so that list is one list in one place — the list
/// `test/probes/export-web-image.js` holds to with a curl that only records.
pub(super) fn run_curl(curl: &Path, dir: &Path, url: &str, path: &Path) -> Result<String, String> {
    let output = Command::new(curl)
        .current_dir(dir)
        .arg("--fail")
        .arg("--silent")
        .arg("--show-error")
        .arg("--location")
        .arg("--max-time")
        .arg("30")
        .arg("--output")
        .arg(path)
        .arg("--write-out")
        .arg("%{content_type}")
        .arg("--")
        .arg(url)
        .output()
        .map_err(|error| {
            crate::i18n::now(
                "app.cannotRun",
                &[("program", &curl.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
    if !output.status.success() {
        let complaint = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if complaint.is_empty() {
            format!("{url} could not be fetched")
        } else {
            complaint
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
