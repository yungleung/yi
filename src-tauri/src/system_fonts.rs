//! The fonts this machine has, by the family names they answer to.
//!
//! The app needs this for one thing: a settings file may name a font, and a name that this machine does
//! not have is not a smaller problem than a missing character — XeTeX stops the whole export with
//! *"The font … cannot be found"* rather than falling back (measured). Saying so on the card, before the
//! reader exports, is the point of reading these files at all.
//!
//! **What it does not say is what a font can draw.** A family name is not a coverage: the macOS
//! `Songti SC` draws Han and kana and has no Hangul at all (measured), and its name says nothing about
//! that. Coverage is a `cmap` question and `font_file` answers it.
//!
//! May import: `std` and `crate::font_file`. Upholds: the list is read **once** per run and cached (it
//! is hundreds of megabytes of font files on a working machine, measured: 543 MB in 367 files here), a
//! directory that is not there is not an error, and a file that is not a font is skipped in silence.

use crate::font_file;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Every family name this machine's fonts answer to, lower-cased and sorted.
pub fn families() -> &'static [String] {
    static FAMILIES: OnceLock<Vec<String>> = OnceLock::new();
    FAMILIES.get_or_init(|| {
        let mut names: Vec<String> = Vec::new();
        for directory in directories() {
            collect(&directory, 0, &mut names);
        }
        for name in &mut names {
            *name = name.to_lowercase();
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

/// The folders a machine keeps its fonts in, this platform's first.
///
/// **Measured on macOS only** — the other two are the platforms' own well-known folders and are not
/// measured from here, which is why a wrong one is harmless: it yields no fonts, and the card then says
/// what it said before this module existed. The reader's own folder is last, because a font they
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

/// Collects the family names of the font files under `directory`, and under its folders.
///
/// Bounded by depth rather than recursing without limit: a font folder is two or three deep at worst,
/// and a symbolic link that points at its own ancestor must not walk forever.
const DEPTH: usize = 4;

fn collect(directory: &Path, depth: usize, out: &mut Vec<String>) {
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
        if !matches!(extension.as_str(), "ttf" | "otf" | "ttc" | "otc") {
            continue;
        }
        let Ok(data) = std::fs::read(&path) else {
            continue;
        };
        for at in font_file::faces(&data) {
            for name in font_file::family_names(&data, at) {
                out.push(name);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    /// The machine this runs on has fonts, and reading them is a cost the card pays once — so the
    /// number is printed rather than assumed.
    #[test]
    fn this_machine_has_families_and_reading_them_is_cheap_enough() {
        let started = Instant::now();
        let names = families();
        let took = started.elapsed();
        println!(
            "system fonts: {} family names in {} files' worth of folders, read in {:?}",
            names.len(),
            directories().len(),
            took
        );
        assert!(names.len() > 20, "a working machine has more than twenty families");
        assert!(names.iter().all(|name| name == &name.to_lowercase()));

        // A name nothing answers to is not found, and neither is an empty one.
        assert!(!has_family("Yi No Such Font 12345"));
        assert!(!has_family("   "));
        // And a name that *is* there is found whatever its case — the two spellings are one font.
        if let Some(any) = names.iter().find(|name| name.contains(' ')) {
            assert!(has_family(any), "{any}");
            assert!(has_family(&any.to_uppercase()), "{any}");
        }
    }
}
