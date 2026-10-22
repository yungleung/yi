//! Conversion of a complete LaTeX document into a Pandoc wrapper proposal.
//!
//! May import: std and the scan wrapper vocabulary. Upholds: `$body$` occurs once, literal dollars
//! survive Pandoc parsing, and title/author replacement is balanced and explicit.

use super::WrapperProposal;
use std::path::Path;

/// Builds the wrapper proposal shown in the import confirmation.
pub(super) fn proposal(source_entry: &str, text: &str) -> Result<WrapperProposal, String> {
    let (preview, line) =
        insert_body(text).ok_or_else(|| crate::i18n::now("template.noDocumentEnd", &[]))?;
    Ok(WrapperProposal {
        source_entry: source_entry.to_string(),
        entry: wrapper_entry(source_entry),
        insertion: crate::i18n::now(
            "template.insertBeforeEnd",
            &[("line", &line.to_string())],
        ),
        preview,
        maps_title: has_command(text, "\\title"),
        maps_author: has_command(text, "\\author"),
    })
}

/// Copies a complete document into a pandoc template: the original's text with `$body$` inserted
/// immediately before the closing document environment.
pub(crate) fn insert_body(text: &str) -> Option<(String, usize)> {
    let marker = "\\end{document}";
    // A complete LaTeX document is not yet a Pandoc template: every literal `$` is a template
    // delimiter there. `$$` emits one literal `$` through Pandoc's template engine, so math and
    // escaped dollars survive while the inserted `$body$` remains the one real variable.
    let escaped = text.replace('$', "$$");
    let offset = escaped.rfind(marker)?;
    let line = escaped[..offset].lines().count() + 1;
    let mut wrapped = String::with_capacity(escaped.len() + marker.len() + 8);
    wrapped.push_str(&escaped[..offset]);
    if !wrapped.ends_with('\n') {
        wrapped.push('\n');
    }
    wrapped.push_str("$body$\n");
    wrapped.push_str(&escaped[offset..]);
    Some((wrapped, line))
}

/// A wrapper entry beside the document it wraps, so relative inputs, graphics and bibliography
/// files keep the folder they were written against.
pub(crate) fn wrapper_entry(entry: &str) -> String {
    sibling_entry(entry, "template.tex")
}

/// The original document kept beside the wrapper.
pub(crate) fn wrapper_source(entry: &str) -> String {
    sibling_entry(entry, "source.tex")
}

fn sibling_entry(entry: &str, name: &str) -> String {
    Path::new(entry)
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(|parent| format!("{}/{}", parent.to_string_lossy().replace('\\', "/"), name))
        .unwrap_or_else(|| name.to_string())
}

/// Whether a TeX document gives `\title{…}` or `\author{…}` a value at all.
fn has_command(text: &str, command: &str) -> bool {
    text.find(command)
        .is_some_and(|offset| text[offset + command.len()..].trim_start().starts_with('{'))
}

/// Replaces one balanced `\title{…}` or `\author{…}` argument. Used by the wrapper's explicit
/// mapping, never by detection.
pub(crate) fn replace_argument(text: &str, command: &str, value: &str) -> String {
    let Some(offset) = text.find(command) else {
        return text.to_string();
    };
    let after = offset + command.len();
    let rest = &text[after..];
    let Some(open) = rest.find('{') else {
        return text.to_string();
    };
    let mut depth = 0usize;
    let mut close = None;
    for (index, character) in rest[open..].char_indices() {
        match character {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    close = Some(open + index);
                    break;
                }
            }
            _ => {}
        }
    }
    let Some(close) = close else {
        return text.to_string();
    };
    let mut replaced = String::with_capacity(text.len() + value.len());
    replaced.push_str(&text[..after + open + 1]);
    replaced.push_str(value);
    replaced.push_str(&text[after + close..]);
    replaced
}
