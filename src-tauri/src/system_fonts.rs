//! The fonts this machine has: the family names they answer to, and what they can draw.
//!
//! The app needs both, for two different questions a card asks before an export:
//!
//! - **is the name the settings file writes one this machine has?** A name it does not have is not a
//!   smaller problem than a missing character — XeTeX stops the whole export with *"The font … cannot be
//!   found"* rather than falling back (measured) — so it is said on the card instead.
//! - **is there a font here that draws the characters the settings cannot?** That is a `cmap` question
//!   and not a name one: the macOS `Songti SC` draws Han and kana and no Hangul at all (measured), and
//!   nothing about the name says so.
//!
//! May import: `std` and `crate::font_file`. Upholds: each answer is read **once** per run and kept (the
//! machine's fonts are 543 MB in 367 files here, measured) and only the tables each question needs are
//! read out of them (`font_file::read_tables`); a folder that is not there, or a file that is not a
//! font, is skipped in silence rather than reported.

use crate::font_file;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Every family name this machine's fonts answer to, lower-cased and sorted.
pub fn families() -> &'static [String] {
    static FAMILIES: OnceLock<Vec<String>> = OnceLock::new();
    FAMILIES.get_or_init(|| {
        let mut names: Vec<String> = Vec::new();
        for path in paths() {
            let Some(image) = font_file::read_tables(path, &[b"name"]) else {
                continue;
            };
            for at in font_file::faces(&image) {
                for name in font_file::family_names(&image, at) {
                    names.push(name.to_lowercase());
                }
            }
        }
        names.sort();
        names.dedup();
        names
    })
}

/// Whether this machine has a font whose family name is `name`.
///
/// Case-insensitively: a settings file is written by hand, and `songti sc` is the same font as
/// `Songti SC` to every font engine there is.
pub fn has_family(name: &str) -> bool {
    let name = name.trim().to_lowercase();
    !name.is_empty() && families().binary_search(&name).is_ok()
}

/// A family of this machine whose face draws **every one** of `points`, if it has one.
///
/// The first fit, in the order the folders are walked — not a preference between faces that would both
/// do: what is promised is a name that draws the note, and a reader who likes another face writes it
/// themselves. Nothing is promised about the *look* of the fit, and the check that made it a fit is the
/// font's own `cmap`.
pub fn covering(points: &[u32]) -> Option<String> {
    if points.is_empty() {
        return None;
    }
    coverages()
        .iter()
        .find(|(_, ranges)| {
            points
                .iter()
                .all(|point| ranges.iter().any(|(first, last)| first <= point && point <= last))
        })
        .map(|(family, _)| family.clone())
}

/// Each font file's family names with what it draws, read once and kept: the machine's fonts are 543 MB
/// here, and a card that asks twice must not read them twice. Only a note with characters no font in the
/// settings can draw ever asks at all, which is what keeps this off the common path.
fn coverages() -> &'static [(String, Vec<(u32, u32)>)] {
    static COVERAGES: OnceLock<Vec<(String, Vec<(u32, u32)>)>> = OnceLock::new();
    COVERAGES.get_or_init(|| {
        let mut out: Vec<(String, Vec<(u32, u32)>)> = Vec::new();
        for path in paths() {
            let Some(image) = font_file::read_tables(path, &[b"cmap", b"name"]) else {
                continue;
            };
            for at in font_file::faces(&image) {
                let ranges = font_file::cmap_ranges(&image, at);
                if ranges.is_empty() {
                    continue;
                }
                for family in font_file::family_names(&image, at) {
                    if !out.iter().any(|(seen, _)| seen.eq_ignore_ascii_case(&family)) {
                        out.push((family, ranges.clone()));
                    }
                }
            }
        }
        out
    })
}

/// Every font file under this platform's folders, in a settled order — the order `covering` calls
/// "first" in, so that the same machine answers the same question the same way twice.
fn paths() -> &'static [PathBuf] {
    static PATHS: OnceLock<Vec<PathBuf>> = OnceLock::new();
    PATHS.get_or_init(|| {
        let mut out = Vec::new();
        for directory in directories() {
            collect(&directory, 0, &mut out);
        }
        out.sort();
        out
    })
}

/// The folders a machine keeps its fonts in, this platform's first.
///
/// **Measured on macOS only** — the other two are the platforms' own well-known folders and are not
/// measured from here, which is why a wrong one is harmless: it yields no fonts, and the card then says
/// what it said before this module existed. The reader's own folders are last, because a font they
/// installed themselves is what they mean by its name.
fn directories() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if cfg!(target_os = "macos") {
        out.push(PathBuf::from("/System/Library/Fonts"));
        out.push(PathBuf::from("/System/Library/Fonts/Supplemental"));
        out.push(PathBuf::from("/Library/Fonts"));
    } else if cfg!(target_os = "windows") {
        if let Some(root) = std::env::var_os("SystemRoot") {
            out.push(PathBuf::from(root).join("Fonts"));
        }
        if let Some(local) = dirs::data_local_dir() {
            out.push(local.join("Microsoft/Windows/Fonts"));
        }
    } else {
        out.push(PathBuf::from("/usr/share/fonts"));
        out.push(PathBuf::from("/usr/local/share/fonts"));
        out.push(PathBuf::from("/usr/share/X11/fonts"));
        if let Some(data) = dirs::data_dir() {
            out.push(data.join("fonts"));
        }
    }
    if let Some(home) = dirs::home_dir() {
        out.push(home.join("Library/Fonts"));
        out.push(home.join(".fonts"));
        out.push(home.join(".local/share/fonts"));
    }
    out.retain(|directory| directory.is_dir());
    out
}

/// Collects the font files under `directory`, and under its folders, bounded by depth: a font folder is
/// two or three deep at worst, and a symbolic link pointing at its own ancestor must not walk forever.
const DEPTH: usize = 4;

fn collect(directory: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if depth < DEPTH {
                collect(&path, depth + 1, out);
            }
            continue;
        }
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_lowercase)
            .unwrap_or_default();
        if matches!(extension.as_str(), "ttf" | "otf" | "ttc" | "otc") {
            out.push(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    /// The machine this runs on has fonts, and reading them is a cost a card pays once — so the numbers
    /// are printed rather than assumed.
    #[test]
    fn this_machine_has_families_and_reading_them_is_cheap_enough() {
        let started = Instant::now();
        let names = families();
        let took = started.elapsed();
        println!(
            "system fonts: {} families, {} files, names read in {:?}",
            names.len(),
            paths().len(),
            took
        );
        assert!(names.len() > 20, "a working machine has more than twenty families");
        assert!(names.iter().all(|name| name == &name.to_lowercase()));

        assert!(!has_family("Yi No Such Font 12345"));
        assert!(!has_family("   "));
        if let Some(any) = names.iter().find(|name| name.contains(' ')) {
            assert!(has_family(any), "{any}");
            assert!(has_family(&any.to_uppercase()), "{any}");
        }
    }

    /// What a font *draws* is a different question from what it is called, and the answer comes from the
    /// font's own `cmap`. This machine's fonts are read for it, which is the expensive half — printed
    /// here rather than assumed.
    #[test]
    fn a_covering_family_is_found_by_reading_cmaps_not_names() {
        let started = Instant::now();
        // Greek: every Mac has a face for it, in one family or another.
        let greek = covering(&[0x03A9]);
        println!(
            "coverage of {} fonts read in {:?}; Greek is answered by {greek:?}",
            coverages().len(),
            started.elapsed()
        );
        assert!(greek.is_some(), "some font on a working machine draws Greek");
        assert!(has_family(&greek.unwrap()), "and it is one this machine has");

        // And a code point nothing draws — in the private use area, which no font claims — is answered
        // with nothing rather than with a guess.
        assert_eq!(covering(&[0xF8FF, 0xF8FE]), None);
        // An empty question is not a question.
        assert_eq!(covering(&[]), None);
        // Two characters need *one* face that has both: Greek and Cyrillic are in the same Noto face on
        // this machine, and a font with only one of them must not be the answer.
        let both = covering(&[0x03A9, 0x0416]);
        assert!(both.is_some(), "a face with Greek and Cyrillic");
        let both = coverages()
            .iter()
            .find(|(family, _)| Some(family) == both.as_ref())
            .map(|(_, ranges)| ranges)
            .unwrap();
        for point in [0x03A9, 0x0416] {
            assert!(both.iter().any(|(first, last)| first <= &point && &point <= last));
        }
    }
}
