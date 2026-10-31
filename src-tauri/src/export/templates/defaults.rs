//! A package's own Pandoc defaults file, when it carries one.
//!
//! Template kits commonly ship `defaults.yaml` with filters, metadata files, variables and a
//! template path of their own. `export.yaml` is the more explicit spelling and wins when both are
//! present. The file is handed to Pandoc after the app's defaults, which lets the package override
//! those settings while the app's command-line paths and switches still win.
//!
//! May import: `std`. Upholds: only a regular file at the package root is selected, and the package
//! never needs a manifest field to make either conventional name work.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

const NAMES: [&str; 2] = ["export.yaml", "defaults.yaml"];

pub(crate) fn package_defaults(package: &Path) -> Option<PathBuf> {
    NAMES
        .iter()
        .map(|name| package.join(name))
        .find(|path| path.is_file())
}

pub(crate) fn append_defaults(arguments: &mut Vec<OsString>, path: &Path) {
    arguments.push(OsString::from("--defaults"));
    arguments.push(path.as_os_str().to_os_string());
}

/// A PDF's defaults may not turn on an engine's unrestricted shell escape.
///
/// The export is already handing Pandoc a template the reader chose to trust. Enabling shell
/// execution on top of that widens the trust boundary to every TeX command in the kit, which the
/// product explicitly does not do.
pub(crate) fn ensure_pdf_defaults_safe(path: &Path) -> Result<(), String> {
    let text = std::fs::read_to_string(path)
        .map_err(|error| crate::i18n::path_error("template.cannotRead", path.display(), error))?;
    let compact: String = text
        .to_ascii_lowercase()
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect();
    if compact.contains("shellescape") || compact.contains("enablewrite18") {
        return Err(crate::i18n::now(
            "template.unsafeDefaults",
            &[("file", &path.display().to_string())],
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(label: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!(
            "yi-template-defaults-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&folder).unwrap();
        folder
    }

    #[test]
    fn export_yaml_is_the_explicit_name_and_defaults_yaml_is_the_fallback() {
        let package = scratch("names");
        assert_eq!(package_defaults(&package), None);

        std::fs::write(package.join("defaults.yaml"), "metadata: {}\n").unwrap();
        assert_eq!(
            package_defaults(&package),
            Some(package.join("defaults.yaml"))
        );

        std::fs::write(package.join("export.yaml"), "metadata: {}\n").unwrap();
        assert_eq!(
            package_defaults(&package),
            Some(package.join("export.yaml"))
        );
        let _ = std::fs::remove_dir_all(package);
    }

    #[test]
    fn a_directory_named_like_a_defaults_file_is_not_handed_to_pandoc() {
        let package = scratch("directory");
        std::fs::create_dir_all(package.join("export.yaml")).unwrap();
        assert_eq!(package_defaults(&package), None);
        let _ = std::fs::remove_dir_all(package);
    }

    #[test]
    fn a_pdf_defaults_file_cannot_enable_unrestricted_shell_escape() {
        let package = scratch("shell-escape");
        let safe = package.join("defaults.yaml");
        std::fs::write(&safe, "metadata: {}\n").unwrap();
        assert!(ensure_pdf_defaults_safe(&safe).is_ok());

        std::fs::write(&safe, "pdf-engine-opt:\n  - --shell-escape\n").unwrap();
        assert!(ensure_pdf_defaults_safe(&safe).is_err());
        std::fs::write(&safe, "pdf-engine-opt: [-enable-write18]\n").unwrap();
        assert!(ensure_pdf_defaults_safe(&safe).is_err());
        let _ = std::fs::remove_dir_all(package);
    }
}
