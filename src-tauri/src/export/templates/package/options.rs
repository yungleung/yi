//! Normalization for optional provenance text in template packages.
//!
//! Example: `Some("  ")` becomes `None`; `Some("  CC BY 4.0 ")` becomes
//! `Some("CC BY 4.0")`.
//!
//! May import: nothing. Upholds: empty provenance is stored as absent.

pub(super) fn clean_option(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}
