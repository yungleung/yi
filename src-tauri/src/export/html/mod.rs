//! HTML export helpers: attribute scanning and local media packaging.
//!
//! Example: an HTML target becomes a bundle page, and each local `<img src>` is copied beside it and
//! rewritten to `<stem>.assets/…`; attribute scans also feed Reveal.js asset discovery.
//!
//! May import: the two focused HTML children. Upholds: callers use one HTML facade while scanning,
//! path rules and packaging remain independently testable.

mod attributes;
mod media;

pub(super) use attributes::attribute_values;
pub(super) use media::{html_output, package_html_media, package_local_media};
