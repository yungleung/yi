//! The faces this build ships, and the LaTeX header that wires them into a PDF export.
//!
//! XeTeX has no font fallback: a character outside the current font is reported *missing character*
//! and drawn as nothing, so a note written in a script no font on the machine answers for exports
//! with the space its words took and none of the words. Measured: `你好，世界` came out as blank space
//! until a font was named, and naming one is still the reader's line to write. What this module does
//! is start the page already able to draw all of these, by shipping a face per script and a header
//! that hands XeTeX the right one per Unicode block.
//!
//! Three facts live here and nowhere else: where the faces are (the folder the bundler installs them
//! into, or the crate's own `assets/fonts` in a development run); the header itself, written into the
//! export folder before every PDF export with the folder and the Han face substituted into it — every
//! time, because it names the faces by absolute path and an app that has moved would leave a header
//! pointing at a folder that is no longer there; and what those faces draw, read out of the fonts
//! themselves, which is what lets the window say what a page will lose.
//!
//! May import: `std`, `tauri` (for the resource path), `crate::files` for the atomic write and
//! `crate::fonts::file` for reading the faces.
//! Upholds: the header is written from the asset this build ships, naming the fonts this build ships,
//! so a page that draws a script is evidence about this build.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;

/// The faces, as the files they are in `assets/fonts`. Every name here is also a name the header
/// reaches for, and the coverage below is read from these files and no others.
pub const FACES: &[&str] = &[
    "NotoSerif-Regular.ttf",           // Greek, Cyrillic, Coptic, Glagolitic
    "NotoSerif-Bold.ttf",              // … and the bold and italic a note may ask for
    "NotoSerif-Italic.ttf",
    "NotoSerifHebrew-Regular.ttf",     // Hebrew
    "NotoSerifHebrew-Bold.ttf",
    "Amiri-Regular.ttf",               // Arabic
    "Amiri-Bold.ttf",
    "NotoSerifDevanagari-Regular.ttf", // Devanagari
    "NotoSerifDevanagari-Bold.ttf",
    "NotoSerifThai-Regular.ttf",       // Thai
    "NotoSerifThai-Bold.ttf",
    "NotoSerifArmenian-Regular.ttf",   // Armenian
    "NotoSerifArmenian-Bold.ttf",
    "NotoSerifGeorgian-Regular.ttf",   // Georgian
    "NotoSerifGeorgian-Bold.ttf",
    "NotoSerifCJKsc-Regular.otf",      // Han, kana, Hangul
];

/// The one face whose script is also the one a machine usually has a font for under another name:
/// Han and kana, drawn with a `CJKmainfont` when the settings file names one.
pub const HAN_FACE: &str = "NotoSerifCJKsc-Regular.otf";

/// A script the header defines a face for.
#[derive(Debug)]
pub struct Slot {
    /// The script, spelled the way the header names the family (`\yiGreek`) and the way the settings
    /// file's line for it is spelled in lower case (`yi-greek-font`).
    pub script: &'static str,
    /// The settings file's key for a face of the reader's own, or none where the key is pandoc's.
    pub key: Option<&'static str>,
    /// The face this build ships for the script, when the file names none.
    pub file: &'static str,
    /// The faces this build ships for the *styles* a note may ask of it, as fontspec's key for the style
    /// and the file: `("BoldFont", …)`. Empty where this build ships no such face — measured, `bold` in
    /// Han or Hangul is XeTeX's own emboldening instead (see [`FAKE_BOLD`]), because the Han face's real
    /// bold is 25.5 MB, which is one note's heading worth of weight against another whole face.
    pub styles: &'static [(&'static str, &'static str)],
}

/// Every script the header draws, in the order it defines them.
///
/// Han and kana are the one slot with no `yi-<script>-font` line of its own: `CJKmainfont` is pandoc's
/// own key, it is what a reader writes for Han, and the header hands the name over (measured:
/// `export-pdf-font.js` reads a page back and finds the reader's face on it).
pub const SLOTS: &[Slot] = &[
    Slot {
        script: "Greek",
        key: Some("yi-greek-font"),
        file: "NotoSerif-Regular.ttf",
        styles: &[("BoldFont", "NotoSerif-Bold.ttf"), ("ItalicFont", "NotoSerif-Italic.ttf")],
    },
    Slot {
        script: "Cyrillic",
        key: Some("yi-cyrillic-font"),
        file: "NotoSerif-Regular.ttf",
        styles: &[("BoldFont", "NotoSerif-Bold.ttf"), ("ItalicFont", "NotoSerif-Italic.ttf")],
    },
    Slot {
        script: "Hebrew",
        key: Some("yi-hebrew-font"),
        file: "NotoSerifHebrew-Regular.ttf",
        styles: &[("BoldFont", "NotoSerifHebrew-Bold.ttf")],
    },
    Slot {
        script: "Arabic",
        key: Some("yi-arabic-font"),
        file: "Amiri-Regular.ttf",
        styles: &[("BoldFont", "Amiri-Bold.ttf")],
    },
    Slot {
        script: "Devanagari",
        key: Some("yi-devanagari-font"),
        file: "NotoSerifDevanagari-Regular.ttf",
        styles: &[("BoldFont", "NotoSerifDevanagari-Bold.ttf")],
    },
    Slot {
        script: "Thai",
        key: Some("yi-thai-font"),
        file: "NotoSerifThai-Regular.ttf",
        styles: &[("BoldFont", "NotoSerifThai-Bold.ttf")],
    },
    Slot {
        script: "Armenian",
        key: Some("yi-armenian-font"),
        file: "NotoSerifArmenian-Regular.ttf",
        styles: &[("BoldFont", "NotoSerifArmenian-Bold.ttf")],
    },
    Slot {
        script: "Georgian",
        key: Some("yi-georgian-font"),
        file: "NotoSerifGeorgian-Regular.ttf",
        styles: &[("BoldFont", "NotoSerifGeorgian-Bold.ttf")],
    },
    Slot {
        script: "Hangul",
        key: Some("yi-hangul-font"),
        file: "NotoSerifCJKsc-Regular.otf",
        styles: &[],
    },
    Slot {
        script: "Han",
        key: Some("CJKmainfont"),
        file: HAN_FACE,
        styles: &[],
    },
];

/// The file the header is written as, in the export folder, for pandoc to `--include-in-header`.
pub const HEADER_FILE: &str = "pdf-fonts.tex";

/// The header this build ships, with two holes in it: `@@FONTS@@` for the folder the faces are in,
/// and `@@HAN@@` for the line that makes the Han and kana face.
const HEADER_ASSET: &str = include_str!("../../assets/export/pdf-fonts.tex");

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

/// Writes the header into `dir`, one face per script, and answers with its path.
///
/// A script is drawn with the face `settings` names for it — `yi-<script>-font`, or `CJKmainfont` for
/// Han and kana — and with the face this build ships when the file names none. That is the whole of
/// what this file's reader is offered: a face of their own for any one script, by the name their
/// machine knows it by, or the build's face.
pub fn write_header(dir: &Path, fonts: &Path, settings: &str) -> Result<PathBuf, String> {
    let mut faces = String::new();
    for slot in SLOTS {
        // The braces around a name are written `{{ }}` so that they survive the format: an unbraced name
        // is not a file fontspec can look up (`[Path={…}]Noto…otf` was measured to fail the whole
        // export with "cannot be found").
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
    crate::files::write_atomically(&path, &text).map_err(|error| {
        crate::i18n::now(
            "export.cannotWrite",
            &[("path", &path.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    Ok(path)
}

/// A shipped face's options past `Path`: the styles this build has faces for, or — where it has none —
/// the emboldening that stands in for them.
///
/// **One or the other, never both**: `AutoFakeBold` beside a `BoldFont` makes fontspec embolden the
/// *regular* face and ignore the bold one (measured: the family's bold series came out as
/// `…-Regular.ttf` with `embolden=1.5` in the log, and the page held no bold face at all).
fn style_options(slot: &Slot) -> String {
    if slot.styles.is_empty() {
        return format!(",AutoFakeBold={FAKE_BOLD}");
    }
    slot.styles
        .iter()
        .map(|(key, file)| format!(",{key}={file}"))
        .collect()
}

/// The factor a shipped face is emboldened by, for the slots that have **no bold face to hand** (see
/// [`Slot::styles`]): the Han and Hangul face, whose real bold is 25.5 MB — as much again as every
/// other shipped face together — against one heading's worth of weight.
///
/// LaTeX otherwise substitutes the regular face *with a warning*: measured, `**bold**` and a
/// `## heading` in a shipped script came out with the same ink and the same width as the text around
/// them (`Font shape …/bx/n undefined`, defaults substituted), which for a note whose headings are its
/// structure is the weight lost. 1.5 is XeTeX's stroke-widening (measured: the same line drawn
/// 299.7pt wide plain comes out 342.6pt), and it is applied **only to this build's own faces** — a face
/// the reader names is left alone, so their font's real bold is the one used.
const FAKE_BOLD: &str = "1.5";

/// The font a settings file names for `key`, comment lines not counted.
///
/// A **comment does not count**: the shipped files' headers talk about fonts at length — they explain
/// what happens without one, and they show the per-script lines by name — and reading one of those
/// lines as a reader who has chosen is the mistake that once left the characters missing.
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
        let value = value.split('#').next().unwrap_or("").trim().trim_matches('"').trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

/// The scripts whose face the settings file names itself: its `yi-<script>-font` lines.
///
/// Han is not among them even when the file names it — its key is pandoc's `CJKmainfont`, which the
/// window is told about separately (`NamedFonts.cjk_mainfont`), and one fact with two homes is how the
/// two drift apart.
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

/// Every font a settings file names, whatever the key it names it with — `mainfont`, `CJKmainfont`, and
/// the `yi-<script>-font` lines — each once, in the order the keys are read.
///
/// This is the list the app checks against the machine (`fonts::system::has_family`): a name that is not
/// there is not a smaller problem than a missing character, and the card can say so before the export
/// stops with the engine's own sentence.
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

/// The faces' folder as fontspec wants it written: **with** a separator on the end.
///
/// Measured, and worth the sentence: `Path=` names a folder, and one written without its last
/// separator finds nothing at all — every face of the header came back *"The font … cannot be found"*,
/// which stops the whole export rather than falling back to anything.
fn folder(fonts: &Path) -> String {
    let mut text = fonts.display().to_string();
    if !text.ends_with('/') && !text.ends_with('\\') {
        text.push('/');
    }
    text
}

/// The code points the shipped faces draw, as `[first, last]` ranges, sorted and coalesced.
///
/// Read from the fonts' own `cmap` tables, so a face swapped for another cannot leave the window
/// claiming coverage the page does not have. The Han face is the one exception, and it is trimmed to
/// the blocks the header routes to it: that face also carries Latin, punctuation, and a repertoire of
/// symbols and arrows, and none of those reach it through the header — the several hundred code points
/// Noto CJK holds around `≤`, `→` and `★` are drawn with the document's own font on a page, which is
/// measured not to have them, so a hint reading that face's whole cmap would say nothing about them.
///
/// Read once per run and remembered: it is 25 MB of font files, and every export of a note asks.
pub fn coverage(fonts: &Path) -> &'static [[u32; 2]] {
    static COVERAGE: OnceLock<Vec<[u32; 2]>> = OnceLock::new();
    COVERAGE
        .get_or_init(|| {
            let mut points: Vec<(u32, u32)> = Vec::new();
            for face in FACES {
                let han = *face == HAN_FACE;
                // Every face is read through the same parser the machine's own fonts go through
                // (`fonts::file`), and all of a file's faces — one, for these.
                let Ok(data) = std::fs::read(fonts.join(face)) else {
                    continue;
                };
                let ranges: Vec<(u32, u32)> = crate::fonts::file::faces(&data)
                    .into_iter()
                    .flat_map(|at| crate::fonts::file::cmap_ranges(&data, at))
                    .filter(|(first, last)| !han || routed_to_han(*first, *last))
                    .collect();
                points.extend(ranges);
            }
            points.sort_unstable();
            let mut merged: Vec<[u32; 2]> = Vec::new();
            for (first, last) in points {
                match merged.last_mut() {
                    Some(open) if first <= open[1].saturating_add(1) => open[1] = open[1].max(last),
                    _ => merged.push([first, last]),
                }
            }
            merged
        })
        .as_slice()
}

/// The blocks the header routes to the Han and kana face, as the ranges they cover: CJK punctuation,
/// kana, Bopomofo, the unified and compatibility ideographs with their extensions, radicals, strokes,
/// enclosed letters, halfwidth and fullwidth forms, and the Hangul blocks.
const HAN_BLOCKS: &[(u32, u32)] = &[
    (0x1100, 0x11ff),   // Hangul jamo
    (0x2e80, 0x2eff),   // CJK radicals supplement
    (0x2f00, 0x2fdf),   // Kangxi radicals
    (0x2ff0, 0x2fff),   // ideographic description characters
    (0x3000, 0x303f),   // CJK symbols and punctuation
    (0x3040, 0x30ff),   // hiragana, katakana
    (0x3100, 0x312f),   // Bopomofo
    (0x3130, 0x318f),   // Hangul compatibility jamo
    (0x3190, 0x319f),   // Kanbun
    (0x31a0, 0x31bf),   // Bopomofo extended
    (0x31c0, 0x31ef),   // CJK strokes
    (0x31f0, 0x31ff),   // katakana phonetic extensions
    (0x3200, 0x32ff),   // enclosed CJK letters and months
    (0x3400, 0x4dbf),   // unified ideographs, extension A
    (0x4e00, 0x9fff),   // unified ideographs
    (0xa960, 0xa97f),   // Hangul jamo extended A
    (0xac00, 0xd7af),   // Hangul syllables
    (0xd7b0, 0xd7ff),   // Hangul jamo extended B
    (0xf900, 0xfaff),   // CJK compatibility ideographs
    (0xff00, 0xffef),   // halfwidth and fullwidth forms
    (0x1aff0, 0x1afff), // kana extended B
    (0x1b000, 0x1b16f), // kana supplement, kana extended A, small kana extension
    (0x1f200, 0x1f2ff), // enclosed ideographic supplement
    (0x20000, 0x3ffff), // unified ideographs, extensions B to H
];

/// Whether a range read out of a font touches one of the blocks the header routes to that face.
fn routed_to_han(first: u32, last: u32) -> bool {
    HAN_BLOCKS.iter().any(|(lo, hi)| first <= *hi && *lo <= last)
}

#[cfg(test)]
mod tests {
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
        assert!(text.contains("\\newfontfamily\\yiHebrew{Frank Ruehl}"), "Hebrew went unnamed");
        assert!(text.contains("\\newfontfamily\\yiHan{Songti SC}"), "Han went unnamed");
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
        assert!(!text.contains("AutoFakeBold=1.5,BoldFont"), "both ways of bolding a face at once");
        assert!(text.contains("\\yiHangul[Path={/faces/},AutoFakeBold=1.5]"), "no emboldening for Hangul");
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
        let covered =
            |point: u32| coverage(&fonts()).iter().any(|[lo, hi]| (*lo..=*hi).contains(&point));
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
            assert!(covered(point), "{script} is shipped and not claimed: U+{point:04X}");
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
            assert!(!covered(point), "{what} is claimed and is not drawn: U+{point:04X}");
        }
    }
}
