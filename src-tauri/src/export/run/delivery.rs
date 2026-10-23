//! Delivering the files an export leaves beside or around its main output.
//!
//! May import: std, the export request and kind vocabulary, template assets and the run's output
//! path rule. Upholds: package and note assets stay inside the output folder, an existing different
//! file is reported rather than overwritten, and a native bibliography carries only the supplied
//! cited entries.

use super::ExportRequest;
use super::environment::absolute_output;
use crate::export::kinds::ExportKind;
use crate::export::templates::TemplateManifest;
use crate::export::templates::{reference_to, safe_prefix};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

/// Copies the package's sidecar files where the output still refers to them.
///
/// A LaTeX output is compiled elsewhere, so every asset travels beside the `.tex` (class, style,
/// bibliography, figures). An HTML whose reader settings turn self-contained off keeps its links,
/// so the asset tree is copied under each relative prefix the finished page uses. EPUB, DOCX, ODT
/// and PDF are containers: their assets are read by pandoc or the engine, and the output is whole.
pub(super) fn deliver_package_assets(
    package: &Path,
    manifest: &TemplateManifest,
    request: &ExportRequest,
    kind: &ExportKind,
) -> Result<(), String> {
    if kind.kind == "latex" {
        return deliver_latex_assets(package, manifest, request);
    }
    if kind.kind == "epub" {
        let output = absolute_output(&request.output_path, request.source_dir.as_deref());
        return crate::export::templates::pack_epub(&output, package, manifest);
    }
    if kind.kind != "html" {
        return Ok(());
    }
    let output = absolute_output(&request.output_path, request.source_dir.as_deref());
    deliver_html_assets(package, manifest, &output)
}

/// A `.tex` is only useful with what it names: the whole asset tree goes beside it.
pub(crate) fn deliver_latex_assets(
    package: &Path,
    manifest: &TemplateManifest,
    request: &ExportRequest,
) -> Result<(), String> {
    let output = absolute_output(&request.output_path, request.source_dir.as_deref());
    let folder = output
        .parent()
        .ok_or_else(|| crate::i18n::now("export.noTarget", &[]))?;
    let native = request
        .native_bibliography
        .as_ref()
        .map(|bibliography| {
            safe_bibliography_path(&bibliography.path).map(|path| (bibliography, path))
        })
        .transpose()?;
    for name in asset_names(manifest) {
        if native
            .as_ref()
            .is_some_and(|(bibliography, _)| bibliography.path == name)
            || request.note_assets.iter().any(|asset| asset.target == name)
        {
            continue;
        }
        copy_asset(
            &crate::export::templates::manifest_file(package, &name),
            &folder.join(&name),
        )?;
    }
    if let Some((bibliography, path)) = native {
        let target = folder.join(path);
        if target.is_dir() {
            return Err(crate::i18n::now(
                "template.outputConflict",
                &[("file", &target.display().to_string())],
            ));
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                crate::i18n::now(
                    "export.cannotMake",
                    &[
                        ("path", &parent.display().to_string()),
                        ("reason", &error.to_string()),
                    ],
                )
            })?;
        }
        crate::files::write_atomically(&target, &bibliography.text).map_err(|error| {
            crate::i18n::now(
                "export.cannotWrite",
                &[
                    ("path", &target.display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        })?;
    }
    Ok(())
}

/// A native bibliography is a relative `.bib` inside the output folder, never an absolute path or a
/// climb out of the source tree the reader will compile.
fn safe_bibliography_path(path: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    let safe = !path.is_empty()
        && !path.contains('\\')
        && !candidate.is_absolute()
        && candidate
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
        && candidate
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("bib"));
    if safe {
        Ok(candidate.to_path_buf())
    } else {
        Err(crate::i18n::now("template.badPath", &[("file", path)]))
    }
}

/// A LaTeX note picture is copied under the generated `<stem>.assets/` tree beside its `.tex`.
pub(crate) fn deliver_note_assets(request: &ExportRequest) -> Result<(), String> {
    if request.note_assets.is_empty() {
        return Ok(());
    }
    let output = absolute_output(&request.output_path, request.source_dir.as_deref());
    let folder = output
        .parent()
        .ok_or_else(|| crate::i18n::now("export.noTarget", &[]))?;
    for asset in &request.note_assets {
        let target = folder.join(safe_note_asset_path(&asset.target)?);
        copy_bundle_asset(Path::new(&asset.source), &target)?;
    }
    Ok(())
}

fn safe_note_asset_path(path: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    let safe = !path.contains('\\')
        && !candidate.is_absolute()
        && candidate
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
        && candidate
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                matches!(
                    extension.to_ascii_lowercase().as_str(),
                    "avif"
                        | "gif"
                        | "jpeg"
                        | "jpg"
                        | "pdf"
                        | "png"
                        | "svg"
                        | "tif"
                        | "tiff"
                        | "webp"
                )
            });
    if safe {
        Ok(candidate.to_path_buf())
    } else {
        Err(crate::i18n::now("template.badPath", &[("file", path)]))
    }
}

/// An HTML page that is not self-contained keeps its relative links, so the assets go beside it
/// under the same prefixes. The finished page is read rather than the template: a self-contained
/// page has already inlined these files, and copying them again would be clutter.
pub(crate) fn deliver_html_assets(
    package: &Path,
    manifest: &TemplateManifest,
    output: &Path,
) -> Result<(), String> {
    let Ok(text) = fs::read_to_string(output) else {
        return Ok(());
    };
    let folder = output
        .parent()
        .ok_or_else(|| crate::i18n::now("export.noTarget", &[]))?;
    let assets = asset_names(manifest);
    let mut prefixes = BTreeSet::new();
    for asset in &assets {
        if let Some(reference) = reference_to(&text, asset) {
            if let Some(prefix) = reference.strip_suffix(asset.as_str()) {
                if safe_prefix(prefix) {
                    prefixes.insert(prefix.to_string());
                }
            }
        }
    }
    // Even a self-contained page may not name every file a journal kit carries. The reader asked
    // for a bundle folder, so the whole package travels there; with no link to infer a prefix from,
    // use the folder name the template was written in.
    if prefixes.is_empty() {
        prefixes.insert(html_bundle_prefix(manifest, &assets));
    }
    for prefix in prefixes {
        for asset in &assets {
            let target = folder.join(&prefix).join(asset);
            // A kit may ship a sample with the same name as the page being written (`Yuki` ships
            // `default-document.html`). The generated page is the output; an asset may never
            // replace it with a stale sample.
            if target == output {
                continue;
            }
            copy_bundle_asset(
                &crate::export::templates::manifest_file(package, asset),
                &target,
            )?;
        }
    }
    Ok(())
}

/// A file inside the HTML bundle belongs to the export that created it. Re-exporting over an old
/// bundle replaces the generated copy; a reader's *output* folder elsewhere is still protected by
/// [`copy_asset`] for LaTeX.
fn copy_bundle_asset(source: &Path, target: &Path) -> Result<(), String> {
    if target.is_dir() {
        return Err(crate::i18n::now(
            "template.outputConflict",
            &[("file", &target.display().to_string())],
        ));
    }
    if target.exists() {
        fs::remove_file(target).map_err(|error| {
            crate::i18n::now(
                "export.cannotWrite",
                &[
                    ("path", &target.display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        })?;
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            crate::i18n::now(
                "export.cannotMake",
                &[
                    ("path", &parent.display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        })?;
    }
    fs::copy(source, target).map_err(|error| {
        crate::i18n::now(
            "export.cannotWrite",
            &[
                ("path", &target.display().to_string()),
                ("reason", &error.to_string()),
            ],
        )
    })?;
    Ok(())
}

fn html_bundle_prefix(manifest: &TemplateManifest, assets: &[String]) -> String {
    let aliases = crate::export::templates::alias_names(manifest);
    if aliases.iter().any(|alias| {
        assets
            .iter()
            .any(|asset| asset.starts_with(&format!("{alias}/")))
    }) {
        return String::new();
    }
    aliases
        .into_iter()
        .find(|alias| alias != &manifest.id)
        .map(|alias| format!("{alias}/"))
        .unwrap_or_default()
}

/// The package's files that are not its entry. The CSL is already in `assets` for a new package;
/// an older manifest may list it only in `csl`, so it is included once either way.
fn asset_names(manifest: &TemplateManifest) -> Vec<String> {
    let mut names = manifest.assets.clone();
    if let Some(csl) = &manifest.csl {
        names.push(csl.clone());
    }
    names.sort();
    names.dedup();
    names
}

/// One copied asset. A different file already at the destination is the reader's and is not
/// overwritten: the export names the conflict instead.
fn copy_asset(source: &Path, target: &Path) -> Result<(), String> {
    if target.exists() {
        if let (Ok(source), Ok(target)) = (fs::read(source), fs::read(target)) {
            if source == target {
                return Ok(());
            }
        }
        return Err(crate::i18n::now(
            "template.outputConflict",
            &[("file", &target.display().to_string())],
        ));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            crate::i18n::now(
                "export.cannotMake",
                &[
                    ("path", &parent.display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        })?;
    }
    fs::copy(source, target).map_err(|error| {
        crate::i18n::now(
            "export.cannotWrite",
            &[
                ("path", &target.display().to_string()),
                ("reason", &error.to_string()),
            ],
        )
    })?;
    Ok(())
}
