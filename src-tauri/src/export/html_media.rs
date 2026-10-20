//! The note's own local pictures when an HTML page is not self-contained.
//!
//! Pandoc writes an absolute file path into `<img src>`; an HTML file moved away from this machine
//! then loses the picture. This copies those files into an `<output>.assets/` folder beside the page
//! and rewrites the `src` to a relative URL. Web URLs and data URIs are left exactly as Pandoc wrote
//! them; only a real local image is copied.
//!
//! May import: the app's atomic file seam and `std`. Upholds: every path copied is an image file,
//! and a rewritten URL stays inside the page's own asset folder.

use std::fs;
use std::path::{Path, PathBuf};

const IMAGE_EXTENSIONS: [&str; 9] = [
    "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp", "tif",
];

pub(super) fn package_html_media(output: &Path) -> Result<(), String> {
    let Ok(html) = fs::read_to_string(output) else {
        return Ok(());
    };
    let Some(folder) = output.parent() else {
        return Ok(());
    };
    let stem = output
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .filter(|stem| !stem.is_empty())
        .unwrap_or_else(|| "page".to_string());
    let asset_folder = format!("{stem}.assets");
    let mut copied: std::collections::BTreeMap<String, String> = std::collections::BTreeMap::new();
    let mut used: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut replacements: Vec<(String, String)> = Vec::new();

    for token in src_values(&html) {
        let Some(source) = local_image(&token) else {
            continue;
        };
        if !source.is_file() {
            continue;
        }
        let key = source.to_string_lossy().into_owned();
        let target_name = if let Some(name) = copied.get(&key) {
            name.clone()
        } else {
            let name = unique_name(&source, &used);
            used.insert(name.clone());
            copy_media(&source, &folder.join(&asset_folder).join(&name))?;
            copied.insert(key, name.clone());
            name
        };
        let relative = format!("{asset_folder}/{}", encode_url(&target_name));
        if token != relative {
            replacements.push((token, relative));
        }
    }

    if replacements.is_empty() {
        return Ok(());
    }
    let mut rewritten = html;
    for (from, to) in replacements {
        rewritten = rewritten.replace(&from, &to);
    }
    crate::files::write_atomically(output, &rewritten).map_err(|error| {
        crate::i18n::now(
            "template.cannotWrite",
            &[("path", &output.display().to_string()), ("reason", &error.to_string())],
        )
    })
}

/// Every `src` attribute value, ignoring `data-src` and similar names.
fn src_values(html: &str) -> Vec<String> {
    let mut values = Vec::new();
    for (at, _) in html.match_indices("src=") {
        if at > 0
            && html[..at]
                .chars()
                .next_back()
                .is_some_and(|character| character.is_alphanumeric() || matches!(character, '-' | ':'))
        {
            continue;
        }
        let after = html[at + 4..].trim_start();
        let Some(first) = after.chars().next() else {
            continue;
        };
        let value = if first == '"' || first == '\'' {
            after[1..]
                .find(first)
                .map(|end| after[1..1 + end].to_string())
        } else {
            after
                .find(|character: char| character.is_whitespace() || character == '>')
                .map(|end| after[..end].to_string())
        };
        if let Some(value) = value.filter(|value| !value.is_empty()) {
            values.push(value);
        }
    }
    values
}

/// The local image a `src` names, or `None` for a web URL, data URI or non-image file.
fn local_image(token: &str) -> Option<PathBuf> {
    let token = token.trim();
    if token.is_empty()
        || token.starts_with("http:")
        || token.starts_with("https:")
        || token.starts_with("data:")
        || token.starts_with("//")
        || token.starts_with('#')
    {
        return None;
    }
    let decoded = if let Some(uri) = token.strip_prefix("file://") {
        let uri = uri.strip_prefix("localhost").unwrap_or(uri);
        decode_percent(uri)
    } else if token.starts_with('/') || is_drive_path(token) {
        decode_percent(token)
    } else {
        return None;
    };
    let path = PathBuf::from(decoded);
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    IMAGE_EXTENSIONS
        .contains(&extension.as_str())
        .then_some(path)
}

fn is_drive_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\')
}

fn unique_name(source: &Path, used: &std::collections::HashSet<String>) -> String {
    let name = source
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "image.png".to_string());
    if !used.contains(&name) {
        return name;
    }
    let path = Path::new(&name);
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| "image".to_string());
    let extension = path
        .extension()
        .map(|extension| format!(".{}", extension.to_string_lossy()))
        .unwrap_or_default();
    let mut number = 2;
    loop {
        let candidate = format!("{stem}-{number}{extension}");
        if !used.contains(&candidate) {
            return candidate;
        }
        number += 1;
    }
}

fn copy_media(source: &Path, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            crate::i18n::now(
                "export.cannotMake",
                &[("path", &parent.display().to_string()), ("reason", &error.to_string())],
            )
        })?;
    }
    fs::copy(source, target).map_err(|error| {
        crate::i18n::now(
            "export.cannotWrite",
            &[("path", &target.display().to_string()), ("reason", &error.to_string())],
        )
    })?;
    Ok(())
}

fn decode_percent(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex(bytes[index + 1]), hex(bytes[index + 2])) {
                decoded.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

fn encode_url(value: &str) -> String {
    value
        .bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
                (byte as char).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}

fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_images_are_copied_and_web_urls_are_left_alone() {
        let dir = std::env::temp_dir().join(format!(
            "yi-html-media-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let image = dir.join("shot one.png");
        fs::write(&image, b"png").unwrap();
        let output = dir.join("note.html");
        fs::write(
            &output,
            format!(
                r#"<img src="{}"><img src="https://example.com/a.png">"#,
                image
                    .to_string_lossy()
                    .split('/')
                    .map(encode_url)
                    .collect::<Vec<_>>()
                    .join("/")
            ),
        )
        .unwrap();
        package_html_media(&output).unwrap();
        let html = fs::read_to_string(&output).unwrap();
        assert!(html.contains(r#"src="note.assets/shot%20one.png""#), "{html}");
        assert!(html.contains(r#"src="https://example.com/a.png""#), "{html}");
        assert_eq!(fs::read(dir.join("note.assets/shot one.png")).unwrap(), b"png");
        let _ = fs::remove_dir_all(dir);
    }
}
