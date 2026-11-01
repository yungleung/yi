//! What the export card says about fonts: the names the settings file writes and the faces it needs.
//!
//! The file is the reader's, so this reads it without writing it; a name this machine lacks is said
//! before the export, and a face that can cover a missing character is offered by name.
//!
//! May import: the export folder, the kind vocabulary and the font family. Upholds: the card's font
//! answer comes from the same file pandoc is handed and from the fonts themselves.

use serde::Serialize;

use super::config::settings_text;
use super::kinds::kind_of;

/// What a kind's conversion settings name, as the window reads it: whether the kind's output is
/// typeset with those fonts at all, whether a font is named for the document as a whole, and whether
/// one is named for CJK.
///
/// The characters are the *window's* half of the question (`ui/export/font_hint.ts`): a formula is not
/// a paragraph — `$x \le y$` draws with the maths font where a bare `≤` does not — so the rule needs
/// the parse, and the parse lives in the webview. What this side owns is the file: its bytes, the
/// shipped copy when the reader has not written one yet, and the one word to look for in it.
///
/// A **comment does not count**. The shipped files' headers talk about fonts at length — they explain
/// what happens without one — and a copy of them must not read as a reader who has chosen (measured the
/// hard way: the app once stepped aside for its own documentation and the characters stayed missing).
pub fn export_named_fonts(app: tauri::AppHandle, kind: String) -> Result<NamedFonts, String> {
    let kind = kind_of(&kind)?;
    let settings = if kind.needs_pandoc {
        settings_text(&app, kind)?
    } else {
        String::new()
    };
    let (mainfont, cjk_mainfont) = named_fonts(&settings);
    Ok(NamedFonts {
        needs_a_font: kind.needs_a_font,
        mainfont: mainfont.is_some(),
        cjk_mainfont: cjk_mainfont.is_some(),
        // What this build's own faces draw, for the kind whose page they draw: the window asks the
        // fonts, not a list of code points kept beside them (`fonts::coverage`), so a face
        // swapped for another cannot leave the card quiet about a page that lost a character.
        shipped: kind
            .ships_fonts
            .then(|| crate::fonts::fonts_dir(&app))
            .transpose()?
            .map(|faces| {
                crate::fonts::coverage(&faces)
                    .iter()
                    .map(|[first, last]| [*first, *last])
                    .collect()
            })
            .unwrap_or_default(),
        // The scripts the file names a face for itself: those are drawn with *that* face, so the hint
        // has the same reason to stay quiet about them as about a named `mainfont` — the reader's font
        // is taken to hold what they chose it for.
        named_scripts: kind
            .ships_fonts
            .then(|| {
                crate::fonts::reader_scripts(&settings)
                    .into_iter()
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        // The names this file writes that no font on this machine answers to. XeTeX stops the whole
        // export on one of those — *"The font … cannot be found"* rather than a fallback — so the card
        // says it while the reader is still looking at the file's name on the card.
        unknown_fonts: if kind.needs_a_font {
            crate::fonts::named_values(&settings)
                .into_iter()
                .filter(|name| !crate::fonts::has_family(name))
                .collect()
        } else {
            Vec::new()
        },
    })
}
/// What a kind's conversion settings name, as the window is told it.
#[derive(Debug, Serialize, Clone)]
pub struct NamedFonts {
    /// Whether the kind's output is typeset with the fonts its settings name (see `ExportKind`).
    pub needs_a_font: bool,
    /// Whether a font is named for the document as a whole: it answers for anything it has.
    pub mainfont: bool,
    /// Whether a font is named for CJK — which xeCJK routes **CJK punctuation, kana, Han and Hangul**
    /// to (measured: with both variables named, a Korean note's Hangul was set with the *CJK* font and
    /// lost with it).
    pub cjk_mainfont: bool,
    /// The code points the faces **this build ships** draw, as `[first, last]` ranges — empty for a
    /// kind whose page they do not draw.
    ///
    /// It is what makes the card's hint quiet about a note this build can already set: with nothing
    /// named, a page draws ten scripts (see `fonts/`), and reporting those characters as lost
    /// would be the hint telling the reader to fix something that is not broken.
    pub shipped: Vec<[u32; 2]>,
    /// The scripts the settings file names a face of its own for, as the header spells them
    /// (`Hebrew`, `Thai`, …; empty for a kind whose page the shipped faces do not draw).
    pub named_scripts: Vec<String>,
    /// The fonts the settings file names that this machine does not have, each once — empty when every
    /// name it writes is one the machine answers to, and for a kind that names no font at all.
    pub unknown_fonts: Vec<String>,
}
/// The family name of a font **this machine has** that draws every one of `points`, or none.
///
/// The window asks this when the card's hint has characters no font in the settings file can draw, and
/// what it gets back is a name the reader can type — checked against the font's own `cmap`, not guessed
/// from its name (measured: the macOS `Songti SC` draws Han and kana and no Hangul at all). There is no
/// list of platform names here on purpose: a machine answers for itself, which is the only answer that
/// holds on a machine nobody here has measured.
pub fn export_font_for(points: Vec<u32>) -> Option<String> {
    crate::fonts::covering(&points)
}
/// The document's own font and Han's, as `settings` names them — `(mainfont, CJKmainfont)`, each absent
/// when the file names none. The reading itself is `fonts::named`, which is also what the header
/// reads the per-script lines with, so which key names a font has one home.
pub(super) fn named_fonts(settings: &str) -> (Option<String>, Option<String>) {
    (
        crate::fonts::named(settings, "mainfont"),
        crate::fonts::named(settings, "CJKmainfont"),
    )
}
