//! Reading a font file's own tables, whoever's font it is.
//!
//! Two callers need this and they are the reason it is a module: `export_fonts` reads the faces this
//! build ships (what they cover, for the card's hint) and `system_fonts` reads whatever the machine
//! has (the family names it answers to). A table is parsed one way, so a mistake in the parsing is one
//! mistake, and neither caller has to know how a TTF is laid out.
//!
//! May import: `std`. Upholds: every byte read is bounds-checked and every absence is `None`/empty —
//! a font file is data from outside this program, and a broken one must not take the app with it.

/// The offsets of the *tables directories* in a font file: a plain TTF/OTF has one at 0, a TrueType
/// collection (`ttcf`) has one per face, and a `.ttc` is what a good deal of what a machine has looks
/// like on macOS.
pub fn faces(data: &[u8]) -> Vec<usize> {
    if data.get(0..4) != Some(b"ttcf") {
        // The four sfnt versions a font file may start with; anything else is not a font at all, and
        // answering "one face at offset 0" for it would only make the callers do the checking.
        let known = matches!(
            data.get(0..4),
            Some(b"\x00\x01\x00\x00") | Some(b"OTTO") | Some(b"true") | Some(b"typ1")
        );
        return if known && data.len() >= 12 { vec![0] } else { Vec::new() };
    }
    let Some(count) = be32(data, 8) else {
        return Vec::new();
    };
    (0..count as usize)
        .filter_map(|face| be32(data, 12 + face * 4).map(|offset| offset as usize))
        .filter(|offset| *offset + 12 <= data.len())
        .collect()
}

/// The table named `tag`, out of the face whose directory is at `directory`.
pub fn table<'a>(data: &'a [u8], directory: usize, tag: &[u8; 4]) -> Option<&'a [u8]> {
    let count = be16(data, directory + 4)? as usize;
    for index in 0..count {
        let at = directory + 12 + index * 16;
        if data.get(at..at + 4)? != tag {
            continue;
        }
        let offset = be32(data, at + 8)? as usize;
        let length = be32(data, at + 12)? as usize;
        return data.get(offset..offset.checked_add(length)?);
    }
    None
}

/// The family names a face answers to, longest first: name record 16 (the typographic family, which is
/// what a font calls itself when it has both) and record 1 (the plain family).
///
/// Both encodings a font may write them in are read — Windows' UTF-16BE and the Mac's single-byte
/// Roman — because a face that has only one of them is common and the name is the whole point here.
pub fn family_names(data: &[u8], directory: usize) -> Vec<String> {
    let Some(name) = table(data, directory, b"name") else {
        return Vec::new();
    };
    let Some(count) = be16(name, 2) else {
        return Vec::new();
    };
    // The strings live after the records, and each record's offset is counted from *there* — the one
    // field in this table that is not absolute (measured the hard way: read as absolute, every family
    // name came back as bytes from the middle of another string).
    let storage = be16(name, 4).unwrap_or(0) as usize;
    let mut found: Vec<(u16, String)> = Vec::new();
    for index in 0..count as usize {
        let at = 6 + index * 12;
        let (Some(platform), Some(id), Some(length), Some(offset)) = (
            be16(name, at),
            be16(name, at + 6),
            be16(name, at + 8),
            be16(name, at + 10),
        ) else {
            continue;
        };
        if id != 1 && id != 16 {
            continue;
        }
        let start = storage + offset as usize;
        let Some(bytes) = name.get(start..start.saturating_add(length as usize)) else {
            continue;
        };
        let text = match platform {
            3 => String::from_utf16_lossy(
                &bytes
                    .chunks_exact(2)
                    .map(|pair| u16::from_be_bytes([pair[0], pair[1]]))
                    .collect::<Vec<u16>>(),
            ),
            1 => bytes.iter().map(|byte| char::from(*byte)).collect(),
            _ => continue,
        };
        let text = text.trim().to_string();
        if !text.is_empty() {
            found.push((id, text));
        }
    }
    // The typographic family first, then the plain one, each once.
    let mut out: Vec<String> = Vec::new();
    for id in [16, 1] {
        for (_, text) in found.iter().filter(|(found, _)| *found == id) {
            if !out.iter().any(|seen| seen.eq_ignore_ascii_case(text)) {
                out.push(text.clone());
            }
        }
    }
    out
}

/// The code points a face maps, as a sorted list of ranges — its `cmap` table, read directly:
/// `otfinfo -u` answers with glyph *names*, and a name is not a code point.
pub fn cmap_ranges(data: &[u8], directory: usize) -> Vec<(u32, u32)> {
    let Some(cmap) = table(data, directory, b"cmap") else {
        return Vec::new();
    };
    let Some(count) = be16(cmap, 2) else {
        return Vec::new();
    };
    let mut points: Vec<u32> = Vec::new();
    for index in 0..count as usize {
        let at = 4 + index * 8;
        let (Some(platform), Some(offset)) = (be16(cmap, at), be32(cmap, at + 4)) else {
            continue;
        };
        // 3 is Windows, whose subtables hold real code points; the macOS one (1) is at best a
        // duplicate of them and at worst a legacy encoding of its own.
        if platform != 3 {
            continue;
        }
        let offset = offset as usize;
        match be16(cmap, offset) {
            Some(4) => points.extend(format_four(cmap, offset)),
            Some(12) | Some(13) => points.extend(format_twelve(cmap, offset)),
            _ => {}
        }
    }
    points.sort_unstable();
    points.dedup();
    let mut ranges: Vec<(u32, u32)> = Vec::new();
    for point in points {
        match ranges.last_mut() {
            Some(open) if point == open.1 + 1 => open.1 = point,
            _ => ranges.push((point, point)),
        }
    }
    ranges
}

/// The subtable that maps single code points through segments — format 4, the one nearly every font
/// has, and the only one that reaches the Latin blocks.
fn format_four(cmap: &[u8], at: usize) -> Vec<u32> {
    let mut out = Vec::new();
    let Some(segments) = be16(cmap, at + 6).map(|value| value as usize / 2) else {
        return out;
    };
    let ends = at + 14;
    let starts = ends + segments * 2 + 2; // one reserved word between the two
    let deltas = starts + segments * 2;
    let offsets = deltas + segments * 2;
    for segment in 0..segments {
        let (Some(end), Some(start), Some(delta), Some(offset)) = (
            be16(cmap, ends + segment * 2),
            be16(cmap, starts + segment * 2),
            be16(cmap, deltas + segment * 2),
            be16(cmap, offsets + segment * 2),
        ) else {
            continue;
        };
        if start > end || end == 0xffff {
            continue;
        }
        for point in start..=end {
            let glyph = if offset == 0 {
                point.wrapping_add(delta)
            } else {
                let address = offsets + segment * 2 + offset as usize + (point - start) as usize * 2;
                match be16(cmap, address) {
                    None | Some(0) => continue,
                    Some(glyph) => glyph,
                }
            };
            if glyph != 0 {
                out.push(point as u32);
            }
        }
    }
    out
}

/// The subtable that maps whole groups of code points — format 12, which is how a face with Han in it
/// reaches past the segments format 4 can hold.
fn format_twelve(cmap: &[u8], at: usize) -> Vec<u32> {
    let mut out = Vec::new();
    let Some(groups) = be32(cmap, at + 12) else {
        return out;
    };
    for group in 0..groups as usize {
        let entry = at + 16 + group * 12;
        let (Some(first), Some(last)) = (be32(cmap, entry), be32(cmap, entry + 4)) else {
            continue;
        };
        out.extend(first..=last);
    }
    out
}

fn be16(data: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_be_bytes(data.get(at..at + 2)?.try_into().ok()?))
}

fn be32(data: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(data.get(at..at + 4)?.try_into().ok()?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    /// The parser against both shapes a file comes in: one of this build's own faces (a single font),
    /// and a collection (what a machine's Chinese faces are, and the reason `faces` exists).
    #[test]
    fn it_reads_a_single_font_and_a_collection() {
        let ours = Path::new(env!("CARGO_MANIFEST_DIR")).join("assets/fonts/NotoSerifHebrew-Regular.ttf");
        let data = std::fs::read(ours).unwrap();
        assert_eq!(faces(&data).len(), 1, "a plain font has one face");
        let names = family_names(&data, 0);
        println!("name records: {names:?}");
        assert!(names.iter().any(|name| name.contains("Noto Serif Hebrew")));
        assert!(!cmap_ranges(&data, 0).is_empty());

        let collection = Path::new("/System/Library/Fonts/Supplemental/Songti.ttc");
        if let Ok(data) = std::fs::read(collection) {
            let offsets = faces(&data);
            assert!(offsets.len() > 1, "a collection has several faces");
            let names: Vec<String> = offsets.iter().flat_map(|at| family_names(&data, *at)).collect();
            assert!(names.iter().any(|name| name.contains("Songti")), "{names:?}");
            // And each face is read on its own: the first one has an `cmap` at least.
            assert!(!cmap_ranges(&data, offsets[0]).is_empty());
        }
    }

    /// A file that is not a font, or is cut short, answers with nothing rather than panicking — it is
    /// data from outside this program.
    #[test]
    fn rubbish_answers_nothing() {
        assert!(faces(b"").is_empty());
        assert!(faces(b"not a font at all").is_empty());
        assert!(table(b"not a font at all", 0, b"cmap").is_none());
        assert!(family_names(b"\x00\x01\x00\x00garbage", 0).is_empty());
        assert!(cmap_ranges(b"\x00\x01\x00\x00garbage", 0).is_empty());
    }
}
