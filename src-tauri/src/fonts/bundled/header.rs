//! Builds the LaTeX header that maps scripts to shipped or reader-named faces.
//!
//! Example: `yi-thai-font: Sarabun` emits `\newfontfamily\yiThai{Sarabun}`;
//! without that setting it emits the shipped Thai face by absolute path.
//!
//! May import: std paths, the shipped face catalogue and the atomic file write.
//! Upholds: every script gets exactly one fontspec family, and a named reader
//! face is never combined with this build's fake-bold option.

use super::faces::{Slot, SLOTS};
use std::path::{Path, PathBuf};

/// The file the header is written as in the export folder.
pub const HEADER_FILE: &str = "pdf-fonts.tex";

const HEADER_ASSET: &str = include_str!("../../../assets/export/pdf-fonts.tex");
const FAKE_BOLD: &str = "1.5";

/// Writes the header into `dir`, one face per script, and answers its path.
pub fn write_header(dir: &Path, fonts: &Path, settings: &str) -> Result<PathBuf, String> {
    let mut faces = String::new();
    for slot in SLOTS {
        let line = match slot.key.and_then(|key| named(settings, key)) {
            Some(name) => format!("\\newfontfamily\\yi{}{{{name}}}", slot.script),
            None => format!(
                "\\newfontfamily\\yi{}[Path={{{}}}{}]{{{}}}",
                slot.script,
                folder(fonts),
                style_options(slot),
                slot.file
            ),
        };
        faces.push_str(&line);
        faces.push('\n');
    }
    let text = HEADER_ASSET
        .replace("@@FONTS@@", &format!("{{{}}}", folder(fonts)))
        .replace("@@FACES@@", faces.trim_end());
    let path = dir.join(HEADER_FILE);
    crate::files::write_atomically(&path, &text)
        .map_err(|error| crate::i18n::path_error("export.cannotWrite", path.display(), error))?;
    Ok(path)
}

/// A settings line's value, ignoring comments and case in its key.
pub fn named(settings: &str, key: &str) -> Option<String> {
    for line in settings.lines() {
        if line.trim_start().starts_with('#') {
            continue;
        }
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if !name.trim().eq_ignore_ascii_case(key) {
            continue;
        }
        let value = value
            .split('#')
            .next()
            .unwrap_or("")
            .trim()
            .trim_matches('"')
            .trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

/// The scripts whose `yi-<script>-font` line names a reader font.
pub fn reader_scripts(settings: &str) -> Vec<&'static str> {
    SLOTS
        .iter()
        .filter(|slot| {
            slot.key
                .is_some_and(|key| key.starts_with("yi-") && named(settings, key).is_some())
        })
        .map(|slot| slot.script)
        .collect()
}

/// Every distinct family named by the settings, in font key order.
pub fn named_values(settings: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let keys = ["mainfont", "CJKmainfont"].into_iter().chain(
        SLOTS
            .iter()
            .filter_map(|slot| slot.key)
            .filter(|key| key.starts_with("yi-")),
    );
    for key in keys {
        if let Some(name) = named(settings, key) {
            if !out.iter().any(|seen| seen.eq_ignore_ascii_case(&name)) {
                out.push(name);
            }
        }
    }
    out
}

/// A shipped face's optional style files, or fake bold when it has no real bold.
pub(super) fn style_options(slot: &Slot) -> String {
    if slot.styles.is_empty() {
        return format!(",AutoFakeBold={FAKE_BOLD}");
    }
    slot.styles
        .iter()
        .map(|(key, file)| format!(",{key}={file}"))
        .collect()
}

/// The face folder with fontspec's required trailing separator.
fn folder(fonts: &Path) -> String {
    let mut text = fonts.display().to_string();
    if !text.ends_with('/') && !text.ends_with('\\') {
        text.push('/');
    }
    text
}
