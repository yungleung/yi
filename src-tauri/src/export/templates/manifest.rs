//! The app's own record of one export template package: its shape, its schema and its safe paths.
//!
//! A package is a folder under the export data with a `template.json` the app writes. The manifest
//! names the one entry pandoc is handed, the files that travel with it, and where the package came
//! from. It is JSON because it is app metadata and nothing pandoc reads; the reader edits it through
//! the details form, never by hand.
//!
//! May import: the kind vocabulary, `serde` and the app's file seam. Upholds: a manifest names one
//! entry that matches its mode and kind, and every path in it stays inside its package.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};

use super::super::kinds::{kind_of, KindTemplate, TemplateMode};

/// The manifest schema this build understands.
pub(super) const MANIFEST_SCHEMA: u32 = 1;

/// Where a package came from, kept for provenance only: the package no longer depends on the path.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct TemplateOrigin {
    /// `file`, `folder`, `zip`, `pandoc-default` or `duplicate`.
    #[serde(rename = "type")]
    pub source_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imported: Option<String>,
}

/// One package as the app writes it.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct TemplateManifest {
    pub schema: u32,
    pub id: String,
    pub name: String,
    /// The export kind this package is for: `html`, `latex`, `pdf`, `epub`, `docx` or `odt`.
    pub kind: String,
    pub mode: TemplateMode,
    pub origin: TemplateOrigin,
    /// The entry a text package hands pandoc: the file containing `$body$`.
    #[serde(default)]
    pub template: Option<String>,
    /// The binary reference document a Word or OpenDocument package hands pandoc.
    #[serde(default)]
    pub reference_doc: Option<String>,
    /// The citation style the package carries, if it carries one.
    #[serde(default)]
    pub csl: Option<String>,
    /// Every other file in the package, as a package-relative path with `/` separators.
    #[serde(default)]
    pub assets: Vec<String>,
    /// The assets copied beside a LaTeX output, so the reader's own compile can find them.
    #[serde(default)]
    pub deliver: Vec<String>,
}

impl TemplateManifest {
    /// The entry file this package hands pandoc, whichever mode it is in.
    pub fn entry(&self) -> &str {
        self.template
            .as_deref()
            .or(self.reference_doc.as_deref())
            .unwrap_or("")
    }

    /// Checks everything the app assumes before using a package: the schema, the kind and mode, the
    /// one entry, and that no path can leave the package folder.
    ///
    /// Example: a text package with `template: "main.tex"` and asset `"class/journal.cls"`
    /// passes; the same manifest with `template: "../main.tex"` fails before use.
    pub(super) fn validate(&self) -> Result<(), String> {
        if self.schema > MANIFEST_SCHEMA {
            return Err(crate::i18n::now(
                "template.schemaNewer",
                &[("version", &self.schema.to_string())],
            ));
        }
        if self.schema != MANIFEST_SCHEMA {
            return Err(crate::i18n::now(
                "template.schemaUnknown",
                &[("version", &self.schema.to_string())],
            ));
        }
        if self.name.trim().is_empty() {
            return Err(crate::i18n::now("template.nameEmpty", &[]));
        }
        let kind = kind_of(&self.kind)?;
        if self.mode == TemplateMode::ReferenceDoc {
            if kind.template_mode != KindTemplate::ReferenceDoc {
                return Err(crate::i18n::now(
                    "template.referenceKind",
                    &[("kind", &self.kind)],
                ));
            }
            if self.template.is_some() || self.reference_doc.is_none() {
                return Err(crate::i18n::now("template.referenceEntry", &[]));
            }
        } else {
            if kind.template_mode != KindTemplate::Text {
                return Err(crate::i18n::now(
                    "template.textKind",
                    &[("kind", &self.kind)],
                ));
            }
            if self.reference_doc.is_some() || self.template.is_none() {
                return Err(crate::i18n::now("template.textEntry", &[]));
            }
        }
        for path in std::iter::once(self.entry())
            .chain(self.csl.iter().map(String::as_str))
            .chain(self.assets.iter().map(String::as_str))
            .chain(self.deliver.iter().map(String::as_str))
        {
            relative_path(path)?;
        }
        for delivered in &self.deliver {
            if !self.assets.contains(delivered) && Some(delivered.as_str()) != self.csl.as_deref() {
                return Err(crate::i18n::now(
                    "template.deliverNotAsset",
                    &[("file", delivered)],
                ));
            }
        }
        Ok(())
    }
}

/// Reads one package's manifest and refuses a shape this build cannot use.
pub(super) fn read_manifest(package: &Path) -> Result<TemplateManifest, String> {
    let path = package.join("template.json");
    let text = fs::read_to_string(&path).map_err(|error| {
        crate::i18n::path_error("template.manifestUnreadable", path.display(), error)
    })?;
    let manifest: TemplateManifest = serde_json::from_str(&text).map_err(|error| {
        crate::i18n::path_error("template.manifestInvalid", path.display(), error)
    })?;
    manifest.validate()?;
    Ok(manifest)
}

/// Writes the manifest in one step, so a reader or a launcher never sees half of it.
pub(super) fn write_manifest(package: &Path, manifest: &TemplateManifest) -> Result<(), String> {
    manifest.validate()?;
    let text = serde_json::to_string_pretty(manifest).map_err(|error| {
        crate::i18n::path_error("template.manifestInvalid", package.display(), error)
    })?;
    let path = package.join("template.json");
    crate::files::write_atomically(&path, &(text + "\n"))
        .map_err(|error| crate::i18n::path_error("template.cannotWrite", path.display(), error))
}

/// A path that is a package-relative path: one or more normal components, no absolute root, no
/// parent and no empty name. A manifest is app-written, but a package is a folder a reader can
/// also edit, and every use of one of these names has to stay inside the package.
///
/// Example: `relative_path("assets/site.css")` returns that relative path;
/// `relative_path("../site.css")` and `relative_path("/site.css")` are refused.
pub(super) fn relative_path(name: &str) -> Result<PathBuf, String> {
    if name.is_empty() || name.starts_with('/') || name.contains('\\') {
        return Err(crate::i18n::now("template.badPath", &[("file", name)]));
    }
    let path = Path::new(name);
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                let part = part.to_string_lossy();
                if part.is_empty() || part == "." || part == ".." {
                    return Err(crate::i18n::now("template.badPath", &[("file", name)]));
                }
                clean.push(part.as_ref());
            }
            _ => return Err(crate::i18n::now("template.badPath", &[("file", name)])),
        }
    }
    if clean.as_os_str().is_empty() {
        return Err(crate::i18n::now("template.badPath", &[("file", name)]));
    }
    Ok(clean)
}

/// The path a package-relative file has on disk, held inside the package.
pub(super) fn file_in(package: &Path, name: &str) -> Result<PathBuf, String> {
    Ok(package.join(relative_path(name)?))
}

/// The identifier a display name starts from: lower-case ASCII letters and digits, with every other
/// run of characters becoming one dash. A name with nothing ASCII in it keeps the `template` stem.
pub(super) fn slugify(name: &str) -> String {
    let mut slug = String::new();
    let mut dash = false;
    for character in name.chars() {
        if character.is_ascii_alphanumeric() {
            if dash && !slug.is_empty() {
                slug.push('-');
            }
            dash = false;
            slug.push(character.to_ascii_lowercase());
        } else {
            dash = true;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "template".to_string()
    } else {
        slug
    }
}

/// An id no package in `templates` has: the slug, then `-2`, `-3`, … for each name already taken.
pub(super) fn unique_id(templates: &Path, name: &str) -> String {
    let base = slugify(name);
    if !templates.join(&base).exists() {
        return base;
    }
    let mut number = 2u32;
    loop {
        let candidate = format!("{base}-{number}");
        if !templates.join(&candidate).exists() {
            return candidate;
        }
        number += 1;
    }
}

/// Today as the manifest records it: a date, in the reader's own time zone.
pub(super) fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest() -> TemplateManifest {
        TemplateManifest {
            schema: MANIFEST_SCHEMA,
            id: "journal-x".to_string(),
            name: "Journal X".to_string(),
            kind: "latex".to_string(),
            mode: TemplateMode::Template,
            origin: TemplateOrigin {
                source_type: "folder".to_string(),
                path: Some("/downloads/journal-x".to_string()),
                source: Some("https://journal.example/kit".to_string()),
                license: Some("CC BY 4.0".to_string()),
                imported: Some("2026-10-19".to_string()),
            },
            template: Some("main.tex".to_string()),
            reference_doc: None,
            csl: None,
            assets: vec!["journal.cls".to_string()],
            deliver: vec!["journal.cls".to_string()],
        }
    }

    #[test]
    fn a_manifest_round_trips_through_the_json_pandoc_never_reads() {
        let text = serde_json::to_string_pretty(&manifest()).unwrap();
        let read: TemplateManifest = serde_json::from_str(&text).unwrap();
        assert_eq!(read, manifest());
        assert!(text.contains("\"reference-doc\"") == false);
        assert!(text.contains("\"mode\": \"template\""));
        assert!(text.contains("\"type\": \"folder\""));
    }

    #[test]
    fn a_newer_schema_is_refused_by_the_version_it_names() {
        let mut newer = manifest();
        newer.schema = 2;
        let error = newer.validate().unwrap_err();
        assert!(error.contains('2'), "{error}");
    }

    #[test]
    fn one_entry_matches_the_mode_and_the_kind() {
        let mut both = manifest();
        both.reference_doc = Some("journal.docx".to_string());
        assert!(both.validate().is_err());
        let mut wrong_kind = manifest();
        wrong_kind.kind = "docx".to_string();
        assert!(wrong_kind.validate().is_err());
        let mut reference = manifest();
        reference.kind = "docx".to_string();
        reference.mode = TemplateMode::ReferenceDoc;
        reference.template = None;
        reference.reference_doc = Some("journal.docx".to_string());
        reference.assets.clear();
        reference.deliver.clear();
        assert!(reference.validate().is_ok());
    }

    #[test]
    fn a_delivered_file_is_one_of_the_assets() {
        let mut missing = manifest();
        missing.deliver = vec!["elsewhere.cls".to_string()];
        assert!(missing.validate().is_err());
    }

    #[test]
    fn a_path_may_not_leave_the_package() {
        for name in [
            "../note.tex",
            "/etc/passwd",
            "a\\b.tex",
            "",
            "./a.tex",
            "a/../b",
        ] {
            assert!(relative_path(name).is_err(), "{name}");
        }
        assert_eq!(
            relative_path("assets/logo.png").unwrap(),
            PathBuf::from("assets/logo.png")
        );
    }

    #[test]
    fn a_slug_is_ascii_and_unique_with_a_number() {
        assert_eq!(
            slugify("Journal X — LaTeX submission"),
            "journal-x-latex-submission"
        );
        assert_eq!(slugify("  ***  "), "template");
        let folder = std::env::temp_dir().join(format!(
            "yi-slug-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(folder.join("journal-x")).unwrap();
        assert_eq!(unique_id(&folder, "journal x"), "journal-x-2");
        fs::create_dir_all(folder.join("journal-x-2")).unwrap();
        assert_eq!(unique_id(&folder, "journal x"), "journal-x-3");
        let _ = fs::remove_dir_all(folder);
    }

    #[test]
    fn the_fixture_both_sides_read_is_a_manifest_this_build_accepts() {
        // The same file is read by `check-template-manifest.mjs`: the shape the Rust side writes is
        // the shape the window's types describe.
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../test/fixtures/templates/manifest.fixture.json");
        let text = fs::read_to_string(path).unwrap();
        let read: TemplateManifest = serde_json::from_str(&text).unwrap();
        read.validate().unwrap();
    }
}
