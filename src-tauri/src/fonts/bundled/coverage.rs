//! Reads the Unicode ranges actually drawn by the shipped font files.
//!
//! Example: a face containing U+05D0 contributes its Hebrew `cmap` ranges;
//! the Han face is trimmed to the blocks the generated header actually routes.
//!
//! May import: std paths/synchronization, the shipped face catalogue and the
//! shared font-file parser. Upholds: coverage is read from font data once per
//! run, sorted and coalesced, never maintained as a second hand-written list.

use super::faces::{FACES, HAN_FACE};
use std::path::Path;
use std::sync::OnceLock;

/// The code points the shipped faces draw, as sorted, coalesced ranges.
pub fn coverage(fonts: &Path) -> &'static [[u32; 2]] {
    static COVERAGE: OnceLock<Vec<[u32; 2]>> = OnceLock::new();
    COVERAGE
        .get_or_init(|| {
            let mut points: Vec<(u32, u32)> = Vec::new();
            for face in FACES {
                let han = *face == HAN_FACE;
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

const HAN_BLOCKS: &[(u32, u32)] = &[
    (0x1100, 0x11ff),
    (0x2e80, 0x2eff),
    (0x2f00, 0x2fdf),
    (0x2ff0, 0x2fff),
    (0x3000, 0x303f),
    (0x3040, 0x30ff),
    (0x3100, 0x312f),
    (0x3130, 0x318f),
    (0x3190, 0x319f),
    (0x31a0, 0x31bf),
    (0x31c0, 0x31ef),
    (0x31f0, 0x31ff),
    (0x3200, 0x32ff),
    (0x3400, 0x4dbf),
    (0x4e00, 0x9fff),
    (0xa960, 0xa97f),
    (0xac00, 0xd7af),
    (0xd7b0, 0xd7ff),
    (0xf900, 0xfaff),
    (0xff00, 0xffef),
    (0x1aff0, 0x1afff),
    (0x1b000, 0x1b16f),
    (0x1f200, 0x1f2ff),
    (0x20000, 0x3ffff),
];

fn routed_to_han(first: u32, last: u32) -> bool {
    HAN_BLOCKS
        .iter()
        .any(|(lo, hi)| first <= *hi && *lo <= last)
}
