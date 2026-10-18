//! A picture the note names on the web: fetched, named from its type, and kept inside the run.
//!
//! A server's path never becomes a directory: the name is filtered and carries a hash, and the file
//! lands under the run's remote folder. A failed fetch is an error the caller turns into the app's
//! own sentence.
//!
//! May import: `std`, the export folder, the curl seam and the app's i18n. Upholds: one URL is one
//! file per run, and no fetched name can leave the run's folder.

use std::fs;
use std::path::{Path, PathBuf};

use super::config::{export_dir, remote_dir};
use super::curl::{find_curl, run_curl};

/// The extension a picture's own content type has — for the picture types this app can carry or
/// draw, and for nothing else. The five Word holds are handed over as they are, and an SVG or a webp
/// is kept as itself here so the window can carry it in a book or draw it for a Word file
/// (`ui/export/raster_picture.ts`). A file named wrongly is a picture no reader will draw, and a page
/// that answered instead of a picture is not a picture at all.
pub(super) fn image_extension(content_type: &str) -> Option<&'static str> {
    match content_type.split(';').next().unwrap_or("").trim() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/bmp" => Some("bmp"),
        "image/tiff" => Some("tiff"),
        "image/svg+xml" => Some("svg"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

/// A hash of a URL, so one URL is one file however many times a note names it. FNV-1a: what a name
/// needs is that no two URLs of one note share it, not a cryptographic digest.
fn url_hash(url: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in url.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// What a fetched picture is called: the last piece of the URL's own path, filtered the way a
/// style's name is, and the URL's hash — so a name that came from the web can only ever name a file
/// inside the folder it is put in.
pub(super) fn remote_file_name(url: &str) -> String {
    let tail = url
        .split(['?', '#'])
        .next()
        .unwrap_or(url)
        .rsplit('/')
        .find(|piece| !piece.is_empty())
        .unwrap_or("picture");
    let stem: String = tail
        .split('.')
        .next()
        .unwrap_or("")
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
        })
        .take(40)
        .collect();
    let stem = if stem.is_empty() { "picture" } else { stem.as_str() };
    format!("{stem}-{:016x}", url_hash(url))
}
/// One picture from the web, downloaded into a run's own folder, and where it landed.
fn download_image(curl: &Path, dir: &Path, url: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(dir).map_err(|error| crate::i18n::now("export.cannotMake", &[("path", &dir.display().to_string()), ("reason", &error.to_string())]))?;
    let name = remote_file_name(url);
    // The name carries the picture's type, and the type is only known once the server has answered —
    // so it is fetched under a name of its own first and named properly afterwards.
    let partial = dir.join(format!("{name}.download"));
    // One retry, because a fetch that fails once is far likelier to be a network that blinked than a
    // picture that is not there — and measured the other way round: a run whose fetch failed left a
    // book holding the picture's *description*, with the only word about it coming from pandoc, which
    // blamed itself ("compiled without HTTP support") for a failure that was the app's. The second
    // failure is the answer.
    let content_type = match run_curl(curl, dir, url, &partial) {
        Ok(content_type) => content_type,
        Err(first) => {
            std::thread::sleep(std::time::Duration::from_millis(250));
            run_curl(curl, dir, url, &partial).map_err(|_| first)?
        }
    };
    let extension = match image_extension(&content_type) {
        Some(extension) => extension,
        None => {
            let _ = fs::remove_file(&partial);
            // The type is named in the reader's language only when the *app* is what has no answer for
            // it; a type the server wrote down is the server's own name and stays as it is.
            let kind = if content_type.is_empty() {
                crate::i18n::now("export.pictureNoType", &[])
            } else {
                content_type.clone()
            };
            return Err(crate::i18n::now(
                "export.pictureType",
                &[("url", &url), ("type", &kind)],
            ));
        }
    };
    let path = dir.join(format!("{name}.{extension}"));
    fs::rename(&partial, &path)
        .map_err(|error| crate::i18n::now("export.cannotName", &[("path", &path.display().to_string()), ("reason", &error.to_string())]))?;
    Ok(path)
}

/// A picture the note names on the web, brought down as a local file for the pre-process to hand
/// over or, for a kind that cannot carry an SVG or a webp, to draw as a PNG
/// (`ui/export/export_flow.ts`).
///
/// The app fetches it because pandoc may not be able to: a pandoc built without HTTP support answers
/// *"Could not fetch resource …"* and puts the picture's description in the document, which is the
/// hole this fills. A URL that cannot be fetched, or that is not a picture this app can carry or
/// draw, is an error here and the window leaves the destination exactly as the note wrote it —
/// pandoc's own warning about it reaches the reader either way (`ExportOutcome.warnings`).
pub fn export_fetch_image(app: tauri::AppHandle, url: String) -> Result<String, String> {
    let curl = find_curl()
        .0
        .ok_or_else(|| crate::i18n::now("export.noCurl", &[]))?;
    let path = download_image(&curl, &remote_dir(&export_dir(&app)?), &url)?;
    Ok(path.to_string_lossy().into_owned())
}
