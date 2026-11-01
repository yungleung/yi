//! How a finished document names the files a template package carries.
//!
//! A template writes relative URLs in its own spelling — `template/css/site.css`, `css/site.css` —
//! while the package stores `css/site.css`. The delivery step reads the finished page (or EPUB
//! chapter) to learn the prefixes in use, and this module owns that one reading plus the media
//! types an EPUB manifest needs.
//!
//! May import: nothing. Upholds: a path copied beside an output cannot leave the output folder, and
//! a reference is only recognised when it is relative and names a package file.

/// The relative URL token in `text` whose tail is `asset`, if the document names it.
pub(crate) fn reference_to(text: &str, asset: &str) -> Option<String> {
    let boundary = |character: char| {
        character.is_whitespace()
            || matches!(character, '"' | '\'' | '(' | ')' | '<' | '>' | '=' | ',')
    };
    for (at, _) in text.match_indices(asset) {
        let start = text[..at]
            .rfind(boundary)
            .map(|index| index + 1)
            .unwrap_or(0);
        let end = text[at + asset.len()..]
            .find(boundary)
            .map(|index| at + asset.len() + index)
            .unwrap_or(text.len());
        let token = &text[start..end];
        if token.ends_with(asset)
            && !token.starts_with("http")
            && !token.starts_with("data:")
            && !token.starts_with('#')
            && !token.starts_with('/')
            && !token.contains("..")
            && !token.contains('\\')
        {
            return Some(token.to_string());
        }
    }
    None
}

/// A prefix a copied asset may be placed under: relative, inside the output folder.
pub(crate) fn safe_prefix(prefix: &str) -> bool {
    !prefix.starts_with('/')
        && !prefix.contains("..")
        && !prefix.contains('\\')
        && !prefix.starts_with("http")
}

/// The media type an EPUB manifest gives a package asset, or `None` for a file that is not a web
/// resource (a Lua filter, a `.tex` source, the manifest itself) and therefore does not travel in
/// the book.
pub(crate) fn media_type(name: &str) -> Option<&'static str> {
    let extension = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match extension.as_str() {
        "css" => Some("text/css"),
        "js" | "mjs" => Some("application/javascript"),
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "svg" => Some("image/svg+xml"),
        "webp" => Some("image/webp"),
        "woff" => Some("font/woff"),
        "woff2" => Some("font/woff2"),
        "ttf" => Some("font/ttf"),
        "otf" => Some("font/otf"),
        _ => None,
    }
}

/// A URL from one entry in a zip to another, both written as `/`-separated paths.
pub(crate) fn relative_url(from_file: &str, target: &str) -> Option<String> {
    let from_folder: Vec<&str> = from_file.split('/').collect();
    let from_folder = &from_folder[..from_folder.len().saturating_sub(1)];
    let target_parts: Vec<&str> = target.split('/').collect();
    if from_folder
        .iter()
        .chain(target_parts.iter())
        .any(|part| part.is_empty() || *part == "." || *part == ".." || part.contains('\\'))
    {
        return None;
    }
    let common = from_folder
        .iter()
        .zip(target_parts.iter())
        .take_while(|(left, right)| left == right)
        .count();
    let mut parts = Vec::new();
    parts.extend(std::iter::repeat("..").take(from_folder.len() - common));
    parts.extend(target_parts[common..].iter().copied());
    (!parts.is_empty()).then(|| parts.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reference_keeps_the_prefix_and_refuses_absolute_and_climbing_urls() {
        let page = r#"<link href="template/css/site.css"><img src="logo.png">"#;
        assert_eq!(
            reference_to(page, "css/site.css"),
            Some("template/css/site.css".to_string())
        );
        assert_eq!(reference_to(page, "logo.png"), Some("logo.png".to_string()));
        assert_eq!(reference_to(r#"<img src="/logo.png">"#, "logo.png"), None);
        assert_eq!(reference_to(r#"<img src="../logo.png">"#, "logo.png"), None);
        assert_eq!(
            reference_to(r#"<img src="https://x/logo.png">"#, "logo.png"),
            None
        );
    }

    #[test]
    fn a_relative_url_is_from_the_chapter_to_the_packed_asset() {
        assert_eq!(
            relative_url("EPUB/text/ch001.xhtml", "EPUB/assets/css/site.css"),
            Some("../assets/css/site.css".to_string())
        );
        assert_eq!(
            relative_url("EPUB/nav.xhtml", "EPUB/assets/css/site.css"),
            Some("assets/css/site.css".to_string())
        );
    }

    #[test]
    fn only_web_resources_have_an_epub_media_type() {
        assert_eq!(media_type("css/site.css"), Some("text/css"));
        assert_eq!(media_type("js/site.js"), Some("application/javascript"));
        assert_eq!(media_type("img/logo.svg"), Some("image/svg+xml"));
        assert_eq!(media_type("filter.lua"), None);
        assert_eq!(media_type("main.tex"), None);
    }
}
