use super::*;
use std::io::{Read, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const CONTENT: &str = r#"<?xml version="1.0"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:xlink="http://www.w3.org/1999/xlink">
  <office:body><office:text>
    <text:table-of-content>
      <text:table-of-content-source text:outline-level="2">
        <text:index-title-template text:style-name="Contents_20_Heading">Contents</text:index-title-template>
      </text:table-of-content-source>
    </text:table-of-content>
    <text:h text:style-name="Heading_20_1" text:outline-level="1"><text:bookmark-start text:name="introduction" />Introduction<text:bookmark-end text:name="introduction" /></text:h>
    <text:h text:style-name="Heading_20_2" text:outline-level="2"><text:bookmark-start text:name="methods" />Methods &amp; Results<text:bookmark-end text:name="methods" /></text:h>
    <text:h text:style-name="Heading_20_3" text:outline-level="3"><text:bookmark-start text:name="deep" />Not in a two-level TOC<text:bookmark-end text:name="deep" /></text:h>
  </office:text></office:body>
</office:document-content>"#;

#[test]
fn a_pandoc_contents_field_gets_an_index_body_from_its_headings() {
    let content = with_cached_contents(CONTENT).expect("the TOC field should be filled");
    assert!(content.contains("<text:index-body>"), "{content}");
    assert!(content.contains(">Contents</text:p>"), "{content}");
    assert!(content.contains(">Introduction</text:a>"), "{content}");
    assert!(content.contains(">Methods &amp; Results</text:a>"), "{content}");
    assert!(content.contains(r#"text:style-name="Contents_20_2""#), "{content}");
    let body = content
        .split("<text:index-body>")
        .nth(1)
        .and_then(|text| text.split("</text:index-body>").next())
        .unwrap();
    assert!(!body.contains("Not in a two-level TOC"), "{content}");
}

#[test]
fn a_field_that_already_has_an_index_body_is_left_alone() {
    let already = CONTENT.replace(
        "</text:table-of-content-source>",
        "</text:table-of-content-source><text:index-body><text:p>already here</text:p></text:index-body>"
    );
    assert_eq!(with_cached_contents(&already), None);
}

#[test]
fn a_link_before_the_headings_does_not_hide_the_contents() {
    let linked = CONTENT.replace(
        "<text:h ",
        "<text:p><text:hyperlink xlink:href=\"https://example.com\">Link</text:hyperlink></text:p><text:h ",
    );
    let content = with_cached_contents(&linked).expect("the TOC field should be filled");
    assert!(content.contains(">Introduction</text:a>"), "{content}");
    assert!(content.contains(">Methods &amp; Results</text:a>"), "{content}");
}

#[test]
fn non_latin_text_before_the_field_does_not_break_the_depth_fallback() {
    let body = "中文正文".repeat(80);
    let mut padding = String::new();
    let localized = loop {
        let prefix = format!("<text:p>{body}{padding}</text:p>");
        let candidate =
            CONTENT.replace("<office:text>\n    ", &format!("<office:text>\n    {prefix}\n    "));
        let split = candidate
            .find("</text:table-of-content-source>")
            .expect("the fixture has a TOC source")
            .saturating_sub(240);
        if !candidate.is_char_boundary(split) {
            break candidate;
        }
        padding.push('x');
    };
    let content = with_cached_contents(&localized).expect("the TOC field should be filled");
    assert!(content.contains(">Introduction</text:a>"), "{content}");
    let body = content
        .split("<text:index-body>")
        .nth(1)
        .and_then(|text| text.split("</text:index-body>").next())
        .unwrap();
    assert!(!body.contains("Not in a two-level TOC"), "{content}");
}

#[test]
fn caching_contents_rewrites_the_odt_with_mimetype_first() {
    let dir = scratch("odt-toc");
    let path = dir.join("book.odt");
    let file = fs::File::create(&path).unwrap();
    let mut zip = ZipWriter::new(file);
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    zip.start_file("mimetype", stored).unwrap();
    zip.write_all(b"application/vnd.oasis.opendocument.text").unwrap();
    zip.start_file("content.xml", deflated).unwrap();
    zip.write_all(CONTENT.as_bytes()).unwrap();
    zip.finish().unwrap();

    cache_contents(&path).unwrap();

    let file = fs::File::open(&path).unwrap();
    let mut archive = ZipArchive::new(file).unwrap();
    assert_eq!(archive.by_index(0).unwrap().name(), "mimetype");
    let mut content = String::new();
    archive.by_name("content.xml").unwrap().read_to_string(&mut content).unwrap();
    assert!(content.contains("<text:index-body>"), "{content}");
    assert!(content.contains(">Introduction</text:a>"), "{content}");
    let _ = fs::remove_dir_all(dir);
}
