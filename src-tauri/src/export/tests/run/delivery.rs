use super::*;
use std::fs;

fn package_manifest(kind: &str, assets: Vec<String>) -> crate::export::templates::TemplateManifest {
    crate::export::templates::TemplateManifest {
        schema: 1,
        id: "package".to_string(),
        name: "Package".to_string(),
        kind: kind.to_string(),
        mode: if kind == "docx" || kind == "odt" {
            crate::export::TemplateMode::ReferenceDoc
        } else {
            crate::export::TemplateMode::Template
        },
        origin: crate::export::templates::TemplateOrigin {
            source_type: "folder".to_string(),
            path: Some("/Downloads/package".to_string()),
            source: None,
            license: None,
            imported: None,
        },
        template: (kind != "docx").then(|| "main.tex".to_string()),
        reference_doc: (kind == "docx").then(|| "reference.docx".to_string()),
        csl: None,
        assets,
        deliver: Vec::new(),
    }
}

/// An HTML page that was not embedded still names the package's files. The delivery step puts
/// the whole asset tree under the prefix the template wrote, so Yuki's `template/css/…` works
/// and a generic `css/…` works too. A self-contained page has no such link and gets no copies.
#[test]
fn html_delivery_puts_the_asset_tree_where_the_page_names_it() {
    let dir = scratch("html-assets");
    let package = dir.join("package");
    let output = dir.join("out").join("note.html");
    fs::create_dir_all(package.join("css")).unwrap();
    fs::create_dir_all(package.join("js")).unwrap();
    fs::create_dir_all(package.join("img")).unwrap();
    fs::create_dir_all(output.parent().unwrap()).unwrap();
    fs::write(package.join("css/template.css"), "body{}").unwrap();
    fs::write(package.join("js/template.js"), "void 0").unwrap();
    fs::write(package.join("img/logo.png"), b"png").unwrap();
    fs::write(
        &output,
        r#"<link href="template/css/template.css"><script src="template/js/template.js"></script>"#,
    )
    .unwrap();
    fs::create_dir_all(dir.join("out/template/css")).unwrap();
    fs::write(dir.join("out/template/css/template.css"), "old export").unwrap();
    let manifest = package_manifest(
        "html",
        vec![
            "css/template.css".to_string(),
            "js/template.js".to_string(),
            "img/logo.png".to_string(),
        ],
    );
    deliver_html_assets(&package, &manifest, &output).unwrap();
    assert!(dir.join("out/template/css/template.css").is_file());
    assert_eq!(
        fs::read_to_string(dir.join("out/template/css/template.css")).unwrap(),
        "body{}"
    );
    assert!(dir.join("out/template/js/template.js").is_file());
    assert!(dir.join("out/template/img/logo.png").is_file());

    let embedded = dir.join("out/embedded.html");
    fs::write(&embedded, "<style>body{}</style>").unwrap();
    deliver_html_assets(&package, &manifest, &embedded).unwrap();
    assert!(dir.join("out/css/template.css").is_file());
    assert!(dir.join("out/js/template.js").is_file());
    assert!(dir.join("out/img/logo.png").is_file());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn a_self_contained_page_still_receives_unreferenced_package_assets() {
    let dir = scratch("html-self-contained-assets");
    let package = dir.join("package");
    let output = dir.join("out").join("note.html");
    fs::create_dir_all(package.join("css")).unwrap();
    fs::create_dir_all(output.parent().unwrap()).unwrap();
    fs::write(package.join("css/site.css"), "body{}").unwrap();
    fs::write(package.join("readme.txt"), "read me").unwrap();
    fs::write(&output, "<style>body{}</style>").unwrap();
    let mut manifest = package_manifest(
        "html",
        vec!["css/site.css".to_string(), "readme.txt".to_string()],
    );
    manifest.origin.path = Some("/Downloads/template".to_string());
    deliver_html_assets(&package, &manifest, &output).unwrap();
    assert!(dir.join("out/template/css/site.css").is_file());
    assert!(dir.join("out/template/readme.txt").is_file());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn a_template_sample_never_overwrites_the_generated_page() {
    let dir = scratch("html-sample-collision");
    let package = dir.join("package");
    let output = dir.join("out").join("note.html");
    fs::create_dir_all(&package).unwrap();
    fs::create_dir_all(output.parent().unwrap()).unwrap();
    fs::write(package.join("note.html"), "stale sample").unwrap();
    fs::write(&output, "generated page").unwrap();
    let manifest = package_manifest("html", vec!["note.html".to_string()]);
    deliver_html_assets(&package, &manifest, &output).unwrap();
    assert_eq!(fs::read_to_string(&output).unwrap(), "generated page");
    let _ = fs::remove_dir_all(&dir);
}

/// A `.tex` cannot carry its class, style or figures, so every asset travels beside it.
#[test]
fn latex_delivery_copies_every_asset_not_only_the_class_and_bst() {
    let dir = scratch("latex-assets");
    let package = dir.join("package");
    fs::create_dir_all(package.join("img")).unwrap();
    fs::write(package.join("journal.cls"), "class").unwrap();
    fs::write(package.join("img/logo.png"), b"png").unwrap();
    let manifest = package_manifest(
        "latex",
        vec!["journal.cls".to_string(), "img/logo.png".to_string()],
    );
    let request = ExportRequest {
        kind: "latex".to_string(),
        output_path: dir
            .join("out")
            .join("note.tex")
            .to_string_lossy()
            .into_owned(),
        ..request_in(&dir)
    };
    deliver_latex_assets(&package, &manifest, &request).unwrap();
    assert!(dir.join("out/journal.cls").is_file());
    assert!(dir.join("out/img/logo.png").is_file());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn a_native_bibliography_replaces_the_package_sample_with_the_cited_export() {
    let dir = scratch("latex-native-bibliography");
    let package = dir.join("package");
    fs::create_dir_all(package.join("bibliography")).unwrap();
    fs::create_dir_all(package.join("figures")).unwrap();
    fs::write(package.join("references.bib"), "sample-only").unwrap();
    fs::write(package.join("bibliography/apsrev4-2.bst"), "bst").unwrap();
    fs::write(package.join("figures/spectrum.pdf"), b"pdf").unwrap();
    let manifest = package_manifest(
        "latex",
        vec![
            "references.bib".to_string(),
            "bibliography/apsrev4-2.bst".to_string(),
            "figures/spectrum.pdf".to_string(),
        ],
    );
    let request = ExportRequest {
        kind: "latex".to_string(),
        output_path: dir
            .join("out")
            .join("note.tex")
            .to_string_lossy()
            .into_owned(),
        native_bibliography: Some(NativeBibliography {
            path: "references.bib".to_string(),
            text: "@article{cited1965,\n  title={Only the cited work}\n}\n".to_string(),
        }),
        ..request_in(&dir)
    };
    deliver_latex_assets(&package, &manifest, &request).unwrap();
    assert_eq!(
        fs::read_to_string(dir.join("out/references.bib")).unwrap(),
        "@article{cited1965,\n  title={Only the cited work}\n}\n"
    );
    assert!(dir.join("out/bibliography/apsrev4-2.bst").is_file());
    assert!(dir.join("out/figures/spectrum.pdf").is_file());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn a_native_bibliography_target_cannot_leave_the_output_folder() {
    let dir = scratch("latex-bibliography-path");
    let package = dir.join("package");
    fs::create_dir_all(&package).unwrap();
    let manifest = package_manifest("latex", Vec::new());
    let request = ExportRequest {
        kind: "latex".to_string(),
        output_path: dir
            .join("out")
            .join("note.tex")
            .to_string_lossy()
            .into_owned(),
        native_bibliography: Some(NativeBibliography {
            path: "../outside.bib".to_string(),
            text: "@article{cited1965}\n".to_string(),
        }),
        ..request_in(&dir)
    };
    assert!(deliver_latex_assets(&package, &manifest, &request).is_err());
    assert!(!dir.join("outside.bib").exists());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn native_bibliography_leaves_citeproc_and_the_reader_library_off_the_command_line() {
    let dir = scratch("latex-native-arguments");
    fs::write(dir.join("library.bib"), "@article{smith2020}\n").unwrap();
    let request = ExportRequest {
        kind: "latex".to_string(),
        native_bibliography: Some(NativeBibliography {
            path: "references.bib".to_string(),
            text: "@article{smith2020}\n".to_string(),
        }),
        ..request_in(&dir)
    };
    let arguments = named_arguments_for(&dir, &request, kind_of("latex").unwrap());
    assert!(!arguments.contains(&"--bibliography".to_string()));
    assert!(!arguments.contains(&"--csl".to_string()));
    assert!(!arguments
        .iter()
        .any(|argument| argument.starts_with("reference-section-title=")));
}

#[test]
fn latex_note_pictures_are_copied_under_the_generated_asset_bundle() {
    let dir = scratch("latex-note-images");
    fs::create_dir_all(dir.join("input/images")).unwrap();
    fs::write(dir.join("input/images/photo.png"), b"new picture").unwrap();
    fs::create_dir_all(dir.join("out/paper.assets/images")).unwrap();
    fs::write(
        dir.join("out/paper.assets/images/photo.png"),
        b"old picture",
    )
    .unwrap();
    let request = ExportRequest {
        kind: "latex".to_string(),
        output_path: dir.join("out/paper.tex").to_string_lossy().into_owned(),
        note_assets: vec![NoteAsset {
            source: dir
                .join("input/images/photo.png")
                .to_string_lossy()
                .into_owned(),
            target: "paper.assets/images/photo.png".to_string(),
        }],
        ..request_in(&dir)
    };
    deliver_note_assets(&request).unwrap();
    assert_eq!(
        fs::read(dir.join("out/paper.assets/images/photo.png")).unwrap(),
        b"new picture"
    );
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn a_note_picture_wins_over_the_template_picture_at_its_relative_path() {
    let dir = scratch("latex-note-image-wins");
    let package = dir.join("package");
    fs::create_dir_all(package.join("figures")).unwrap();
    fs::write(package.join("figures/spectrum.pdf"), b"template picture").unwrap();
    fs::write(dir.join("spectrum.pdf"), b"note picture").unwrap();
    let manifest = package_manifest("latex", vec!["figures/spectrum.pdf".to_string()]);
    let request = ExportRequest {
        kind: "latex".to_string(),
        output_path: dir.join("out/paper.tex").to_string_lossy().into_owned(),
        note_assets: vec![NoteAsset {
            source: dir.join("spectrum.pdf").to_string_lossy().into_owned(),
            target: "figures/spectrum.pdf".to_string(),
        }],
        ..request_in(&dir)
    };
    deliver_latex_assets(&package, &manifest, &request).unwrap();
    deliver_note_assets(&request).unwrap();
    assert_eq!(
        fs::read(dir.join("out/figures/spectrum.pdf")).unwrap(),
        b"note picture"
    );
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn a_note_picture_target_must_stay_in_its_generated_bundle() {
    let dir = scratch("latex-note-image-path");
    fs::write(dir.join("photo.png"), b"picture").unwrap();
    let request = ExportRequest {
        kind: "latex".to_string(),
        output_path: dir.join("out/paper.tex").to_string_lossy().into_owned(),
        note_assets: vec![NoteAsset {
            source: dir.join("photo.png").to_string_lossy().into_owned(),
            target: "../outside/photo.png".to_string(),
        }],
        ..request_in(&dir)
    };
    assert!(deliver_note_assets(&request).is_err());
    assert!(!dir.join("outside/photo.png").exists());
    let _ = fs::remove_dir_all(&dir);
}
