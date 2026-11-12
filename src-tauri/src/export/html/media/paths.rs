//! Turning HTML picture URLs into local image paths, and copied names back into
//! relative URLs.
//!
//! Example: `file:///tmp/shot%20one.png` names the local image
//! `/tmp/shot one.png`, whose copied name `shot one.png` is written back as
//! `shot%20one.png`.
//!
//! May import: std paths. Upholds: only absolute local paths with a known image
//! extension become media candidates; web, data, fragment and relative URLs do
//! not.

use std::path::PathBuf;
use tauri::Url;

const IMAGE_EXTENSIONS: [&str; 9] = [
    "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp", "tif",
];

/// The local image a `src` names, or `None` for anything the packager must
/// leave alone.
///
/// Example: `local_image("https://example.com/a.png")` is `None`, while
/// `local_image("/tmp/a.png")` is `Some("/tmp/a.png")`.
pub(super) fn local_image(token: &str) -> Option<PathBuf> {
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
    let path = if token.starts_with("file://") {
        Url::parse(token).ok()?.to_file_path().ok()?
    } else if token.starts_with('/') || is_drive_path(token) {
        PathBuf::from(decode_percent(token))
    } else {
        return None;
    };
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    IMAGE_EXTENSIONS
        .contains(&extension.as_str())
        .then_some(path)
}

/// Decodes percent escapes in a local path.
///
/// Example: `decode_percent("shot%20one.png")` returns `"shot one.png"`.
pub(super) fn decode_percent(value: &str) -> String {
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

/// Encodes one copied file name as a relative URL segment.
///
/// Example: `encode_url("shot one.png")` returns `"shot%20one.png"`.
pub(super) fn encode_url(value: &str) -> String {
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

fn is_drive_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\')
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
    fn local_images_are_distinguished_from_remote_and_relative_urls() {
        let shot = std::env::temp_dir().join("shot one.png");
        assert_eq!(
            local_image(&Url::from_file_path(&shot).unwrap().to_string()),
            Some(shot)
        );
        let cover = std::env::temp_dir().join("cover.PNG");
        assert_eq!(local_image(&cover.to_string_lossy()), Some(cover));
        assert_eq!(local_image("https://example.com/cover.png"), None);
        assert_eq!(local_image("data:image/png;base64,abc"), None);
        assert_eq!(local_image("images/cover.png"), None);
        assert_eq!(
            local_image(&std::env::temp_dir().join("notes.txt").to_string_lossy()),
            None
        );
    }

    #[test]
    fn copied_names_round_trip_between_paths_and_urls() {
        assert_eq!(decode_percent("shot%20one.png"), "shot one.png");
        assert_eq!(encode_url("shot one.png"), "shot%20one.png");
    }
}
