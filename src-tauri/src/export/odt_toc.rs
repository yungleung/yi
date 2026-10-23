//! Cached contents entries for an ODT that Pandoc wrote with `toc: true`.
//!
//! Pandoc writes the ODF table-of-contents source and title, but leaves its generated index body
//! empty. LibreOffice can refresh that field; OnlyOffice, which many readers use, displays nothing
//! until an index body exists. This module fills the body from the heading bookmarks already in
//! Pandoc's `content.xml`, so the same automatic TOC is visible in both programs.
//!
//! May import: the zip reader/writer and the app's translation helper. Upholds: the note is not
//! parsed or edited, a document without a TOC is left alone, and the ODT's `mimetype` remains its
//! first, uncompressed entry.

use std::fs;
use std::io::{Read, Write};
use std::path::Path;

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

struct Heading {
    level: usize,
    bookmark: String,
    text: String,
}

/// Fills Pandoc's empty ODT index body from the heading bookmarks in `content.xml`.
///
/// Returns `None` when there is no TOC field or when the field already carries an index body.
pub(super) fn with_cached_contents(content: &str) -> Option<String> {
    let source_close = "</text:table-of-content-source>";
    let source_close_at = content.find(source_close)?;
    let body_from = source_close_at + source_close.len();
    let field_close = "</text:table-of-content>";
    let field_close_at = body_from + content[body_from..].find(field_close)?;
    if content[body_from..field_close_at].contains("<text:index-body>") {
        return None;
    }

    let field_open_at = content.find("<text:table-of-content")?;
    let field_open_end = field_open_at + content[field_open_at..].find('>')?;
    let field_open = &content[field_open_at..=field_open_end];
    let depth = attr(field_open, "text:outline-level")
        .or_else(|| {
            let source_at = content[..source_close_at].rfind("<text:table-of-content-source")?;
            let source_end = source_at + content[source_at..source_close_at].find('>')?;
            attr(&content[source_at..=source_end], "text:outline-level")
        })
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(2);

    let title = content[..source_close_at]
        .rfind("<text:index-title-template")
        .and_then(|start| {
            let end = start + content[start..source_close_at].find('>')?;
            let close = source_close_at.min(content[start..source_close_at].find("</text:index-title-template>")? + start);
            Some(inner_text(&content[end + 1..close]))
        })
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| "Contents".to_string());

    let headings = headings(content, depth);
    let entries = headings
        .iter()
        .map(|heading| {
            format!(
                r##"    <text:p text:style-name="Contents_20_{}"><text:a xlink:type="simple" xlink:href="#{}">{}</text:a></text:p>"##,
                heading.level,
                escape_attr(&heading.bookmark),
                escape_text(&heading.text)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let body = format!(
        "  <text:index-body>\n    <text:index-title text:style-name=\"Contents_20_Heading\">\n      <text:p text:style-name=\"Contents_20_Heading\">{}</text:p>\n    </text:index-title>\n{}\n  </text:index-body>\n",
        escape_text(&title),
        entries
    );
    let mut updated = content.to_string();
    updated.replace_range(field_open_at..=field_open_end, &named_field(field_open));
    let shift = named_field(field_open).len() - field_open.len();
    updated.insert_str(body_from + shift, &body);
    Some(updated)
}

/// Rewrites an ODT in place when its TOC field needs a cached body.
pub(super) fn cache_contents(path: &Path) -> Result<(), String> {
    let file = fs::File::open(path).map_err(|error| cannot_read(path, &error))?;
    let mut archive = ZipArchive::new(file).map_err(|error| bad_zip(path, &error.to_string()))?;
    let mut entries: Vec<(String, Vec<u8>, CompressionMethod)> = Vec::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| bad_zip(path, &error.to_string()))?;
        if entry.is_dir() {
            continue;
        }
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .map_err(|error| cannot_read(path, &error))?;
        entries.push((entry.name().to_string(), bytes, entry.compression()));
    }

    let Some(content_index) = entries.iter().position(|(name, _, _)| name == "content.xml") else {
        return Ok(());
    };
    let Ok(content) = String::from_utf8(entries[content_index].1.clone()) else {
        return Ok(());
    };
    let Some(updated) = with_cached_contents(&content) else {
        return Ok(());
    };
    entries[content_index].1 = updated.into_bytes();

    let temporary = path.with_file_name(format!(
        ".{}.toc-{}.tmp",
        path.file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "document.odt".to_string()),
        nanos()
    ));
    let written = (|| {
        let out = fs::File::create(&temporary).map_err(|error| cannot_write(&temporary, &error))?;
        let mut zip = ZipWriter::new(out);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        if let Some((_, bytes, _)) = entries.iter().find(|(name, _, _)| name == "mimetype") {
            zip.start_file("mimetype", stored).map_err(zip_error)?;
            zip.write_all(bytes).map_err(zip_write_error)?;
        }
        for (name, bytes, compression) in &entries {
            if name == "mimetype" {
                continue;
            }
            let options = SimpleFileOptions::default().compression_method(*compression);
            zip.start_file(name.as_str(), options).map_err(zip_error)?;
            zip.write_all(bytes).map_err(zip_write_error)?;
        }
        zip.finish().map_err(zip_error)?;
        Ok::<(), String>(())
    })();
    if let Err(error) = written {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    fs::rename(&temporary, path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        cannot_write(path, &error)
    })
}

fn headings(content: &str, depth: usize) -> Vec<Heading> {
    let mut found = Vec::new();
    let mut from = 0;
    while let Some(relative) = content[from..].find("<text:h") {
        let start = from + relative;
        let name_end = start + "<text:h".len();
        let is_heading = content[name_end..]
            .chars()
            .next()
            .is_some_and(|character| character == '>' || character.is_whitespace());
        if !is_heading {
            from = name_end;
            continue;
        }
        let Some(tag_end_relative) = content[start..].find('>') else {
            break;
        };
        let tag_end = start + tag_end_relative;
        let Some(close_relative) = content[tag_end + 1..].find("</text:h>") else {
            break;
        };
        let close = tag_end + 1 + close_relative;
        let opening = &content[start..=tag_end];
        let level = attr(opening, "text:outline-level")
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(0);
        let inner = &content[tag_end + 1..close];
        let bookmark = inner.find("<text:bookmark-start").and_then(|marker| {
            let close = marker + inner[marker..].find('>')?;
            attr(&inner[marker..=close], "text:name").map(str::to_string)
        });
        let text = inner_text(inner);
        if level > 0 && level <= depth && !text.is_empty() {
            if let Some(bookmark) = bookmark {
                found.push(Heading {
                    level,
                    bookmark,
                    text,
                });
            }
        }
        from = close + "</text:h>".len();
    }
    found
}

fn named_field(opening: &str) -> String {
    if opening.contains("text:name=") {
        return opening.to_string();
    }
    let attributes = r#" text:name="Yi Table of Contents" text:protected="false""#;
    format!("{}{}>", opening.trim_end_matches('>'), attributes)
}

fn attr<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let start = tag.find(&format!("{name}=\""))? + name.len() + 2;
    let end = start + tag[start..].find('"')?;
    Some(&tag[start..end])
}

fn inner_text(xml: &str) -> String {
    let mut text = String::new();
    let mut from = 0;
    while let Some(open_relative) = xml[from..].find('<') {
        let open = from + open_relative;
        text.push_str(&xml[from..open]);
        let Some(close_relative) = xml[open..].find('>') else {
            break;
        };
        from = open + close_relative + 1;
    }
    text.push_str(&xml[from..]);
    decode(&text)
}

fn decode(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn escape_text(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn escape_attr(text: &str) -> String {
    escape_text(text).replace('"', "&quot;")
}

fn cannot_read(path: &Path, error: &std::io::Error) -> String {
    crate::i18n::now(
        "template.cannotRead",
        &[("path", &path.display().to_string()), ("reason", &error.to_string())],
    )
}

fn cannot_write(path: &Path, error: &std::io::Error) -> String {
    crate::i18n::now(
        "template.cannotWrite",
        &[("path", &path.display().to_string()), ("reason", &error.to_string())],
    )
}

fn bad_zip(path: &Path, reason: &str) -> String {
    crate::i18n::now(
        "template.badZip",
        &[("path", &path.display().to_string()), ("reason", reason)],
    )
}

fn zip_error(error: zip::result::ZipError) -> String {
    crate::i18n::now("template.badZip", &[("path", ""), ("reason", &error.to_string())])
}

fn zip_write_error(error: std::io::Error) -> String {
    crate::i18n::now("template.cannotWrite", &[("path", ""), ("reason", &error.to_string())])
}

fn nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or(0)
}
