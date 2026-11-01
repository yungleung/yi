//! Public facade for the faces this build ships and the PDF font header.
//!
//! XeTeX has no font fallback: a character outside the current font is reported *missing character*
//! and drawn as nothing, so a note written in a script no font on the machine answers for exports
//! with the space its words took and none of the words. Measured: `你好，世界` came out as blank space
//! until a font was named, and naming one is still the reader's line to write. What this module does
//! is start the page already able to draw all of these, by shipping a face per script and a header
//! that hands XeTeX the right one per Unicode block.
//!
//! `bundled_faces` owns the face/slot catalogue, `bundled_header` writes the settings-derived LaTeX
//! family declarations, and `bundled_coverage` reads Unicode ranges from the shipped files. This
//! facade locates the runtime folder and keeps existing callers on `fonts::bundled`.
//!
//! May import: `std`, `tauri` and the three focused bundled-font children.
//! Upholds: the header is written from the asset this build ships, naming the fonts this build ships,
//! so a page that draws a script is evidence about this build.

use std::path::{Path, PathBuf};
use tauri::Manager;

mod coverage;
mod faces;
mod header;

pub use coverage::coverage;
use faces::FACES;
pub use header::{named, named_values, reader_scripts, write_header};

/// Where the faces are on this machine.
///
/// The bundler installs them into the app's resource folder, and `tauri-build` also puts them in the
/// target folder of a development run, which is where the resource path points there. A run whose
/// resource folder holds none of them is a run of this crate rather than of a bundle — `cargo test`,
/// or an editor — and then the crate's own `assets/fonts` is what it has, which is the folder the
/// bundler copies from.
pub fn fonts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let installed = app
        .path()
        .resolve("assets/fonts", tauri::path::BaseDirectory::Resource)
        .map_err(|error| {
            crate::i18n::now("export.noFontsFolder", &[("reason", &error.to_string())])
        })?;
    if holds_faces(&installed) {
        return Ok(installed);
    }
    let beside_the_crate = Path::new(env!("CARGO_MANIFEST_DIR")).join("assets/fonts");
    if holds_faces(&beside_the_crate) {
        return Ok(beside_the_crate);
    }
    Err(crate::i18n::now(
        "export.noShippedFonts",
        &[
            ("installed", &installed.display().to_string()),
            ("beside", &beside_the_crate.display().to_string()),
        ],
    ))
}

/// Whether every face is really in this folder.
fn holds_faces(dir: &Path) -> bool {
    FACES.iter().all(|face| dir.join(face).is_file())
}

#[cfg(test)]
mod tests {
    use super::faces::SLOTS;
    use super::header::style_options;
    use super::*;

    fn fonts() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("assets/fonts")
    }

    /// The header is written from this build's asset and the hole is filled: one face per script, every
    /// line one fontspec can look up, and the reader's own names in the lines that asked for them.
    #[test]
    fn the_header_gives_every_script_a_face() {
        let dir = std::env::temp_dir().join("yi-header-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = write_header(&dir, Path::new("/faces"), "reader: markdown\n").unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(!text.contains("@@"), "a hole is left in the header");
        assert!(text.contains("\\setTransitionTo{BasicLatin}{\\normalfont}"));
        // The folder ends in a separator and the face's name is in braces: `[Path={…}]Noto…otf` is not a
        // name the lookup can find, and both were measured to stop the whole export.
        for slot in SLOTS {
            let expected = format!(
                "\\newfontfamily\\yi{}[Path={{/faces/}}{}]{{{}}}",
                slot.script,
                style_options(slot),
                slot.file
            );
            assert!(
                text.lines().any(|line| line == expected),
                "no face of this build's for {}: {expected}",
                slot.script
            );
        }

        // A file that names a face for two scripts — one of them Han, whose key is pandoc's own — is
        // handed exactly those two by name, and every other script by this build's path.
        let asked = "variables:\n  yi-hebrew-font: \"Frank Ruehl\"\n  CJKmainfont: \"Songti SC\"\n";
        let path = write_header(&dir, Path::new("/faces"), asked).unwrap();
        let text = std::fs::read_to_string(path).unwrap();
        assert!(
            text.contains("\\newfontfamily\\yiHebrew{Frank Ruehl}"),
            "Hebrew went unnamed"
        );
        assert!(
            text.contains("\\newfontfamily\\yiHan{Songti SC}"),
            "Han went unnamed"
        );
        // A named face is left alone, with no emboldening of ours on top of it: its own bold is the one
        // the note should get, and a faked one would take its place.
        assert!(!text.contains("\\yiHebrew{Frank Ruehl}[") && !text.contains("Frank Ruehl]"));
        assert!(
            text.contains(&format!(
                "\\newfontfamily\\yiThai[Path={{/faces/}},BoldFont=NotoSerifThai-Bold.ttf]{{NotoSerifThai-Regular.ttf}}"
            )),
            "a script nobody named lost this build's face"
        );
        // A face this build ships with a real bold is given it, and *no* emboldening: fontspec would
        // embolden the regular and drop the bold face if both were there (measured).
        assert!(
            !text.contains("AutoFakeBold=1.5,BoldFont"),
            "both ways of bolding a face at once"
        );
        assert!(
            text.contains("\\yiHangul[Path={/faces/},AutoFakeBold=1.5]"),
            "no emboldening for Hangul"
        );
    }

    /// The settings file's per-script lines, a comment counting for nothing: the shipped file's own
    /// header shows every one of them by name, and a copy of it must not read as a reader who chose.
    #[test]
    fn a_script_line_names_a_face_and_a_comment_does_not() {
        let file = "variables:\n  yi-thai-font: \"Sarabun\" # mine\n  # yi-hebrew-font: \"Frank Ruehl\"\n  CJKmainfont: \"Songti SC\"\n";
        assert_eq!(named(file, "yi-thai-font").as_deref(), Some("Sarabun"));
        assert_eq!(named(file, "yi-hebrew-font"), None);
        assert_eq!(named(file, "YI-THAI-FONT").as_deref(), Some("Sarabun"));
        assert_eq!(reader_scripts(file), vec!["Thai"]);
        // A file that names nothing of its own answers with nothing, and both files this build ships are
        // ones: their headers talk about the variables and name neither — the latex file on purpose, so
        // that no reader's compile is stopped by a name their machine may not have.
        for kind in crate::export::KINDS
            .iter()
            .filter(|kind| kind.kind == "pdf" || kind.kind == "latex")
        {
            assert!(reader_scripts(kind.defaults).is_empty(), "{}", kind.kind);
            assert_eq!(named(kind.defaults, "mainfont"), None, "{}", kind.kind);
            assert_eq!(named(kind.defaults, "CJKmainfont"), None, "{}", kind.kind);
        }
    }

    /// Every name the file writes, whichever key it writes it with, each once — the list the app checks
    /// against the machine's own fonts, so a name it misses is a run that stops with the engine's
    /// sentence instead of a line on the card.
    #[test]
    fn every_name_a_file_writes_is_collected_once() {
        let file = "variables:\n  mainfont: \"A Wide Font\"\n  CJKmainfont: \"A Han Font\"\n  yi-hebrew-font: \"A Hebrew Font\"\n  yi-thai-font: \"A Wide Font\"\n  # yi-greek-font: \"A Commented Font\"\n  reader: markdown\n";
        assert_eq!(
            named_values(file),
            vec![
                "A Wide Font".to_string(),
                "A Han Font".to_string(),
                "A Hebrew Font".to_string()
            ]
        );
        assert!(named_values("reader: markdown\n").is_empty());
    }

    /// What the faces draw, in the shape the window asks about: the scripts this build claims are
    /// drawn with no reader action, and — just as much the point — the ones it does not.
    #[test]
    fn the_shipped_faces_draw_the_scripts_they_are_for() {
        let covered = |point: u32| {
            coverage(&fonts())
                .iter()
                .any(|[lo, hi]| (*lo..=*hi).contains(&point))
        };
        for (script, point) in [
            ("Hebrew", 0x05d0),
            ("Arabic", 0x0644),
            ("Devanagari", 0x0915),
            ("Thai", 0x0e01),
            ("Armenian", 0x0531),
            ("Georgian", 0x10d0),
            ("Greek", 0x03a9),
            ("Cyrillic", 0x0416),
            ("Han", 0x4e00),
            ("kana", 0x3042),
            ("Hangul", 0xac00),
        ] {
            assert!(
                covered(point),
                "{script} is shipped and not claimed: U+{point:04X}"
            );
        }
        // Scripts with no face of their own, and the symbol blocks the Han face holds but the header
        // does not route to it: claimed, they would be characters the window stayed quiet about and
        // the page lost.
        for (what, point) in [
            ("Tamil", 0x0b95),
            ("Ethiopic", 0x1200),
            ("less-or-equal", 0x2264),
            ("a star", 0x2605),
            ("an arrow", 0x2192),
        ] {
            assert!(
                !covered(point),
                "{what} is claimed and is not drawn: U+{point:04X}"
            );
        }
    }
}
