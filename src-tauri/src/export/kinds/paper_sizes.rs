//! The page sizes the PDF card offers and the `geometry` values they mean.
//!
//! Example: `("A4", "a4paper")` tells the card to show `A4` and the run to append
//! `geometry=a4paper`; it never becomes a separate `papersize` variable.
//!
//! May import: nothing. Upholds: every choice offered by the card is a legal `geometry` option,
//! and the list has one home.

/// The page sizes a reader may choose — the list the pdf defaults file's own comment carries, which is
/// `geometry`'s own: the ISO A, B and C series, JIS B (the one without `paper` after it), letter,
/// executive and legal.
///
/// A size reaches the page as a `geometry` option and **not** as a `papersize` variable, and that is
/// measured: a `papersize` on the command line is *concatenated* with the one the reader's file sets —
/// `a4letterpaper`, a LaTeX warning about an unused global option, and a letter page by luck — while
/// geometry's options are appended after the file's own and take the page with them (measured: a file
/// saying `papersize: a4` plus `geometry=letterpaper` gives letter, `geometry=landscape` gives A4
/// landscape, and `geometry=portrait` over a file saying `geometry: landscape` gives portrait).
pub const PAPER_SIZES: &[(&str, &str)] = &[
    ("A0", "a0paper"),
    ("A1", "a1paper"),
    ("A2", "a2paper"),
    ("A3", "a3paper"),
    ("A4", "a4paper"),
    ("A5", "a5paper"),
    ("A6", "a6paper"),
    ("B0", "b0paper"),
    ("B1", "b1paper"),
    ("B2", "b2paper"),
    ("B3", "b3paper"),
    ("B4", "b4paper"),
    ("B5", "b5paper"),
    ("B6", "b6paper"),
    ("C0", "c0paper"),
    ("C1", "c1paper"),
    ("C2", "c2paper"),
    ("C3", "c3paper"),
    ("C4", "c4paper"),
    ("C5", "c5paper"),
    ("C6", "c6paper"),
    ("B0 JIS", "b0j"),
    ("Letter", "letterpaper"),
    ("Executive", "executivepaper"),
    ("Legal", "legalpaper"),
];
