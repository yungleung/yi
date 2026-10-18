//! The font family: what a font file says, what this build ships, and what this machine has.
//!
//! `file` reads the tables inside a font; `bundled` owns the faces and LaTeX header this build
//! ships; `system` answers what the machine's installed families can draw. They are one module
//! because a question about a glyph is always answered by reading a font file, and the two
//! readers must not grow separate parsers.
//!
//! May import: nothing — the children import their own dependencies. Upholds: one parser for a
//! font file, one home for the shipped faces, and one reader of the machine's fonts.

pub mod bundled;
pub mod file;
pub mod system;
