//! Putting a template package's web assets inside the EPUB it produced.
//!
//! An EPUB is a zip with a manifest, and pandoc does not copy files a custom XHTML template merely
//! links to. This reads the finished book, rewrites those local links to one `assets/` folder,
//! copies the package's CSS/JavaScript/images/fonts there, and declares each in `content.opf`.
//! A package with nothing referenced is left exactly as pandoc wrote it.
//!
//! May import: the asset rules, the package file seam and the zip reader/writer. Upholds: the
//! written book keeps the entry order and `mimetype` storage pandoc gave it, and every copied file
//! is one the template actually named.

use std::fs;
use std::io::{Read, Write};
use std::path::Path;

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use super::assets::{media_type, reference_to, relative_url};
use super::manifest::{file_in, TemplateManifest};

const PACKED: &str = "assets";

pub(crate) fn pack_epub(
    epub: &Path,
    package: &Path,
    manifest: &TemplateManifest,
) -> Result<(), String> {
    let assets: Vec<String> = manifest
        .assets
        .iter()
        .filter(|name| media_type(name).is_some())
        .cloned()
        .collect();
    if assets.is_empty() {
        return Ok(());
    }

    let file = fs::File::open(epub)
        .map_err(|error| crate::i18n::path_error("template.cannotRead", epub.display(), error))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| crate::i18n::path_error("template.badZip", epub.display(), error))?;
    let mut entries: Vec<(String, Vec<u8>)> = Vec::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| crate::i18n::path_error("template.badZip", epub.display(), error))?;
        if entry.is_dir() {
            continue;
        }
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).map_err(|error| {
            crate::i18n::path_error("template.cannotRead", epub.display(), error)
        })?;
        entries.push((entry.name().to_string(), bytes));
    }
    let Some(opf_index) = entries
        .iter()
        .position(|(name, _)| name.ends_with("content.opf"))
    else {
        return Ok(());
    };
    let opf_name = entries[opf_index].0.clone();
    let Some((opf_dir, _)) = opf_name.rsplit_once('/') else {
        return Ok(());
    };
    let mut opf = String::from_utf8(entries[opf_index].1.clone())
        .map_err(|_| crate::i18n::now("template.notText", &[("file", &opf_name)]))?;

    let mut referenced = false;
    for (name, bytes) in entries.iter_mut() {
        if !(name.ends_with(".xhtml") || name.ends_with(".html") || name.ends_with(".htm")) {
            continue;
        }
        let Ok(mut text) = String::from_utf8(bytes.clone()) else {
            continue;
        };
        let mut changed = false;
        for asset in &assets {
            while let Some(token) = reference_to(&text, asset) {
                let target = format!("{opf_dir}/{PACKED}/{asset}");
                let Some(url) = relative_url(name, &target) else {
                    break;
                };
                if token == url {
                    break;
                }
                text = text.replace(&token, &url);
                changed = true;
            }
        }
        if changed {
            *bytes = text.into_bytes();
            referenced = true;
        }
    }
    if !referenced {
        return Ok(());
    }

    let mut additions = String::new();
    let mut number = 1;
    for asset in &assets {
        let href = format!("{PACKED}/{asset}");
        if opf.contains(&format!("href=\"{href}\"")) {
            continue;
        }
        let media = media_type(asset).unwrap_or("application/octet-stream");
        additions.push_str(&format!(
            "\n    <item id=\"yi-asset-{number}\" href=\"{href}\" media-type=\"{media}\"/>"
        ));
        number += 1;
    }
    if number > 1 {
        if !opf.contains("</manifest>") {
            return Ok(());
        }
        opf = opf.replace("</manifest>", &format!("{additions}\n  </manifest>"));
        entries[opf_index].1 = opf.into_bytes();
    } else {
        return Ok(());
    }

    let temporary = epub.with_file_name(format!(
        ".{}.pack-{}.tmp",
        epub.file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "book.epub".to_string()),
        nanos()
    ));
    let written = (|| {
        let out = fs::File::create(&temporary).map_err(|error| {
            crate::i18n::path_error("template.cannotWrite", temporary.display(), error)
        })?;
        let mut zip = ZipWriter::new(out);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        // `mimetype` must be the first entry and stored uncompressed.
        if let Some((_, bytes)) = entries.iter().find(|(name, _)| name == "mimetype") {
            zip.start_file("mimetype", stored).map_err(zip_error)?;
            zip.write_all(bytes).map_err(zip_write_error)?;
        }
        for (name, bytes) in &entries {
            if name == "mimetype" {
                continue;
            }
            zip.start_file(name.as_str(), deflated).map_err(zip_error)?;
            zip.write_all(bytes).map_err(zip_write_error)?;
        }
        for asset in &assets {
            let name = format!("{opf_dir}/{PACKED}/{asset}");
            if entries.iter().any(|(existing, _)| existing == &name) {
                continue;
            }
            let bytes = fs::read(file_in(package, asset)?)
                .map_err(|error| crate::i18n::path_error("template.cannotRead", asset, error))?;
            zip.start_file(name.as_str(), deflated).map_err(zip_error)?;
            zip.write_all(&bytes).map_err(zip_write_error)?;
        }
        zip.finish().map_err(zip_error)?;
        Ok::<(), String>(())
    })();
    if let Err(error) = written {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    fs::rename(&temporary, epub).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        crate::i18n::path_error("template.cannotWrite", epub.display(), error)
    })
}

fn zip_error(error: zip::result::ZipError) -> String {
    crate::i18n::path_error("template.badZip", "", error)
}

fn zip_write_error(error: std::io::Error) -> String {
    crate::i18n::path_error("template.cannotWrite", "", error)
}

fn nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> std::path::PathBuf {
        let folder =
            std::env::temp_dir().join(format!("yi-epub-pack-{}-{}", std::process::id(), nanos()));
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    #[test]
    fn a_template_stylesheet_is_copied_into_the_book_and_declared() {
        let dir = temp_dir();
        let package = dir.join("package");
        fs::create_dir_all(package.join("css")).unwrap();
        fs::write(package.join("css/site.css"), "body{color:red}").unwrap();
        let epub = dir.join("book.epub");
        let out = fs::File::create(&epub).unwrap();
        let mut zip = ZipWriter::new(out);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        zip.start_file("mimetype", stored).unwrap();
        zip.write_all(b"application/epub+zip").unwrap();
        zip.start_file("EPUB/content.opf", deflated).unwrap();
        zip.write_all(
            br#"<?xml version="1.0"?><package><manifest><item id="chapter" href="text/ch.xhtml" media-type="application/xhtml+xml"/></manifest><spine/></package>"#,
        )
        .unwrap();
        zip.start_file("EPUB/text/ch.xhtml", deflated).unwrap();
        zip.write_all(br#"<html><head><link href="template/css/site.css" rel="stylesheet"/></head><body/></html>"#)
            .unwrap();
        zip.finish().unwrap();

        let manifest = TemplateManifest {
            schema: 1,
            id: "book".to_string(),
            name: "Book".to_string(),
            kind: "epub".to_string(),
            mode: super::super::super::kinds::TemplateMode::Template,
            origin: super::super::manifest::TemplateOrigin {
                source_type: "folder".to_string(),
                path: Some("/Downloads/template".to_string()),
                source: None,
                license: None,
                imported: None,
            },
            template: Some("main.xhtml".to_string()),
            reference_doc: None,
            csl: None,
            assets: vec!["css/site.css".to_string()],
            deliver: Vec::new(),
        };
        pack_epub(&epub, &package, &manifest).unwrap();

        let file = fs::File::open(&epub).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        assert_eq!(archive.by_index(0).unwrap().name(), "mimetype");
        let mut stylesheet = String::new();
        archive
            .by_name("EPUB/assets/css/site.css")
            .unwrap()
            .read_to_string(&mut stylesheet)
            .unwrap();
        assert_eq!(stylesheet, "body{color:red}");
        let mut chapter = String::new();
        archive
            .by_name("EPUB/text/ch.xhtml")
            .unwrap()
            .read_to_string(&mut chapter)
            .unwrap();
        assert!(chapter.contains("../assets/css/site.css"), "{chapter}");
        let mut opf = String::new();
        archive
            .by_name("EPUB/content.opf")
            .unwrap()
            .read_to_string(&mut opf)
            .unwrap();
        assert!(
            opf.contains(r#"href="assets/css/site.css" media-type="text/css""#),
            "{opf}"
        );
        let _ = fs::remove_dir_all(dir);
    }
}
