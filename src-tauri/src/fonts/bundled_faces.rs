//! The shipped font files and the script/style slots that use them.
//!
//! Example: `NotoSerifThai-Regular.ttf` is the `Thai` slot's default, while
//! `NotoSerifThai-Bold.ttf` is its shipped `BoldFont`.
//!
//! May import: nothing. Upholds: each shipped face has one catalogue entry and
//! every header slot names a face from this build.

/// The faces, as the files they are in `assets/fonts`.
pub const FACES: &[&str] = &[
    "NotoSerif-Regular.ttf", // Greek, Cyrillic, Coptic, Glagolitic
    "NotoSerif-Bold.ttf",    // … and the bold and italic a note may ask for
    "NotoSerif-Italic.ttf",
    "NotoSerifHebrew-Regular.ttf", // Hebrew
    "NotoSerifHebrew-Bold.ttf",
    "Amiri-Regular.ttf", // Arabic
    "Amiri-Bold.ttf",
    "NotoSerifDevanagari-Regular.ttf", // Devanagari
    "NotoSerifDevanagari-Bold.ttf",
    "NotoSerifThai-Regular.ttf", // Thai
    "NotoSerifThai-Bold.ttf",
    "NotoSerifArmenian-Regular.ttf", // Armenian
    "NotoSerifArmenian-Bold.ttf",
    "NotoSerifGeorgian-Regular.ttf", // Georgian
    "NotoSerifGeorgian-Bold.ttf",
    "NotoSerifCJKsc-Regular.otf", // Han, kana, Hangul
];

/// The Han/kana face also used for Han's `CJKmainfont` slot.
pub const HAN_FACE: &str = "NotoSerifCJKsc-Regular.otf";

/// A script the header defines a face for.
#[derive(Debug)]
pub struct Slot {
    pub script: &'static str,
    pub key: Option<&'static str>,
    pub file: &'static str,
    pub styles: &'static [(&'static str, &'static str)],
}

/// Every script the header draws, in definition order.
pub const SLOTS: &[Slot] = &[
    Slot {
        script: "Greek",
        key: Some("yi-greek-font"),
        file: "NotoSerif-Regular.ttf",
        styles: &[
            ("BoldFont", "NotoSerif-Bold.ttf"),
            ("ItalicFont", "NotoSerif-Italic.ttf"),
        ],
    },
    Slot {
        script: "Cyrillic",
        key: Some("yi-cyrillic-font"),
        file: "NotoSerif-Regular.ttf",
        styles: &[
            ("BoldFont", "NotoSerif-Bold.ttf"),
            ("ItalicFont", "NotoSerif-Italic.ttf"),
        ],
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
