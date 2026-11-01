//! Reading attribute values from generated HTML without parsing the whole page.
//!
//! Example: `<img data-src='cover.png'>` contributes to a `data-src` scan, but
//! an `src` scan ignores it because the attribute name is not `src`.
//!
//! May import: nothing. Upholds: a scan matches a whole attribute name and
//! preserves each value exactly as Pandoc wrote it.

/// Every non-empty value of one named attribute.
///
/// Example: `attribute_values(r#"<a href="one.css"><a href=two.css>"#,
/// "href")` returns `["one.css", "two.css"]`.
pub(crate) fn attribute_values(html: &str, attribute: &str) -> Vec<String> {
    let mut values = Vec::new();
    let needle = format!("{attribute}=");
    for (at, _) in html.match_indices(&needle) {
        if at > 0
            && html[..at].chars().next_back().is_some_and(|character| {
                character.is_alphanumeric() || matches!(character, '-' | ':')
            })
        {
            continue;
        }
        let after = html[at + needle.len()..].trim_start();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_scan_requires_the_whole_attribute_name() {
        let html = r#"
            <img data-src="lazy.png">
            <img src="first.png">
            <img src=second.png>
            <svg><image xlink:href="icon.svg"></svg>
            <a href="one.css"><a href="two.css">
        "#;
        assert_eq!(attribute_values(html, "src"), ["first.png", "second.png"]);
        assert_eq!(attribute_values(html, "href"), ["one.css", "two.css"]);
    }
}
