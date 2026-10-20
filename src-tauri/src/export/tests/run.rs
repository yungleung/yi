    /// A request for the tests that read the arguments: every name it can carry, carried.
    fn request_in(dir: &Path) -> ExportRequest {
        ExportRequest {
            kind: "docx".to_string(),
            text: "# a note\n".to_string(),
            output_path: dir.join("out.docx").to_string_lossy().into_owned(),
            resource_paths: vec![dir.to_string_lossy().into_owned()],
            source_dir: None,
            bibliography: Some(dir.join("library.bib").to_string_lossy().into_owned()),
            csl: Some(CslStyle {
                name: "apa".to_string(),
                xml: "<style>apa</style>".to_string(),
            }),
            references: Some("References".to_string()),
            title: Some("Going out".to_string()),
            language: Some("en-GB".to_string()),
            paper: None,
            landscape: None,
            suppress_references: false,
            template_id: None,
            self_contained: false,
        }
    }

    fn named_arguments(dir: &Path, request: &ExportRequest) -> Vec<String> {
        named_arguments_for(dir, request, kind_of(&request.kind).unwrap())
    }

    fn named_arguments_for(dir: &Path, request: &ExportRequest, kind: &ExportKind) -> Vec<String> {
        pandoc_arguments(
            dir,
            &dir.join(config_file_name(kind.kind)),
            &dir.join("note-1.md"),
            request,
            kind,
            None,
            None,
            None,
        )
        .unwrap()
        .iter()
        .map(|argument| argument.to_string_lossy().into_owned())
        .collect()
    }

    /// The shipped faces draw a PDF page and nothing else — the LaTeX kind is compiled on the reader's
    /// own machine, where this app's bundle is not — and the header reaches pandoc as one more
    /// argument, beside the settings file rather than instead of anything in it.
    #[test]
    fn only_the_kind_whose_page_the_shipped_faces_draw_ships_fonts() {
        let shipping: Vec<&str> = KINDS
            .iter()
            .filter(|kind| kind.ships_fonts)
            .map(|kind| kind.kind)
            .collect();
        assert_eq!(shipping, vec!["pdf"]);

        let dir = scratch("header");
        let request = request_in(&dir);
        let header = dir.join("pdf-fonts.tex");
        let name = "pdf".to_string();
        let arguments = pandoc_arguments(
            &dir,
            &dir.join("export.pdf.yaml"),
            &dir.join("note-1.md"),
            &ExportRequest { kind: name, ..request },
            kind_of("pdf").unwrap(),
            Some(&header),
            None,
            None,
        )
        .unwrap()
        .iter()
        .map(|argument| argument.to_string_lossy().into_owned())
        .collect::<Vec<String>>();
        let at = arguments
            .iter()
            .position(|argument| argument == "--include-in-header")
            .expect("the header is not in the arguments");
        assert_eq!(arguments[at + 1], header.to_string_lossy());
        // And nothing stands in for the settings file: it is still named, as it always was.
        assert!(arguments.contains(&dir.join("export.pdf.yaml").to_string_lossy().into_owned()));
        let _ = fs::remove_dir_all(&dir);
    }

    /// A folder of this test's own, made and taken away again.
    #[test]
    fn the_arguments_are_the_whole_of_what_the_app_asks_pandoc_for() {
        let dir = scratch("arguments");
        fs::write(dir.join("library.bib"), "@article{smith2020}\n").unwrap();
        let request = request_in(&dir);

        assert_eq!(
            named_arguments(&dir, &request),
            vec![
                "--defaults".to_string(),
                dir.join("export.docx.yaml").to_string_lossy().into_owned(),
                "--output".to_string(),
                request.output_path.clone(),
                "--resource-path".to_string(),
                dir.to_string_lossy().into_owned(),
                "--bibliography".to_string(),
                dir.join("library.bib").to_string_lossy().into_owned(),
                "--metadata".to_string(),
                "reference-section-title=References".to_string(),
                "--csl".to_string(),
                dir.join("styles/apa.csl").to_string_lossy().into_owned(),
                dir.join("note-1.md").to_string_lossy().into_owned(),
            ]
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn html_embedding_is_the_cards_explicit_off_by_default_answer() {
        let dir = scratch("html-embedding");
        let off = ExportRequest {
            kind: "html".to_string(),
            self_contained: false,
            ..request_in(&dir)
        };
        let arguments = named_arguments_for(&dir, &off, kind_of("html").unwrap());
        assert!(arguments.contains(&"--embed-resources=false".to_string()));
        let on = ExportRequest {
            self_contained: true,
            ..off
        };
        let arguments = named_arguments_for(&dir, &on, kind_of("html").unwrap());
        assert!(arguments.contains(&"--embed-resources=true".to_string()));
        let _ = fs::remove_dir_all(&dir);
    }

    /// A selected package reaches pandoc as the one entry it names, its style wins over the
    /// reader's own for this export, and the package folder is the first resource path. The
    /// template file is absolute and inside the package the app resolved.
    #[test]
    fn a_selected_package_names_its_entry_style_and_resource_path() {
        let dir = scratch("package");
        let package = dir.join("templates").join("journal");
        fs::create_dir_all(&package).unwrap();
        fs::write(package.join("main.tex"), "$body$").unwrap();
        fs::write(package.join("journal.csl"), "<style/>").unwrap();
        let manifest = crate::export::templates::TemplateManifest {
            schema: 1,
            id: "journal".to_string(),
            name: "Journal".to_string(),
            kind: "latex".to_string(),
            mode: crate::export::TemplateMode::Template,
            origin: crate::export::templates::TemplateOrigin {
                source_type: "folder".to_string(),
                path: None,
                source: None,
                license: None,
                imported: None,
            },
            template: Some("main.tex".to_string()),
            reference_doc: None,
            csl: Some("journal.csl".to_string()),
            assets: vec!["journal.csl".to_string()],
            deliver: Vec::new(),
        };
        let mut request = ExportRequest {
            kind: "latex".to_string(),
            output_path: dir.join("out.tex").to_string_lossy().into_owned(),
            ..request_in(&dir)
        };
        request.bibliography = None;
        request.csl = Some(CslStyle {
            name: "apa".to_string(),
            xml: "<style>apa</style>".to_string(),
        });
        let arguments = pandoc_arguments(
            &dir,
            &dir.join("export.latex.yaml"),
            &dir.join("note-1.md"),
            &request,
            kind_of("latex").unwrap(),
            None,
            Some((&package, &manifest)),
            None,
        )
        .unwrap()
        .iter()
        .map(|argument| argument.to_string_lossy().into_owned())
        .collect::<Vec<String>>();
        let at = arguments
            .iter()
            .position(|argument| argument == "--template")
            .expect("no template was handed over");
        assert_eq!(arguments[at + 1], package.join("main.tex").to_string_lossy());
        let resources = arguments
            .iter()
            .position(|argument| argument == "--resource-path")
            .expect("no resource path");
        assert!(arguments[resources + 1].starts_with(package.to_string_lossy().as_ref()));
        let style_values: Vec<&String> = arguments
            .iter()
            .enumerate()
            .filter(|(index, _)| *index > 0 && arguments[index - 1] == "--csl")
            .map(|(_, argument)| argument)
            .collect();
        assert_eq!(
            style_values.last().copied(),
            Some(&package.join("journal.csl").to_string_lossy().into_owned())
        );
        let _ = fs::remove_dir_all(&dir);
    }

    /// A Word package is handed as `--reference-doc`, never as `--template`.
    #[test]
    fn a_reference_package_is_handed_as_the_binary_pandoc_reads() {
        let dir = scratch("reference");
        let package = dir.join("journal");
        fs::create_dir_all(&package).unwrap();
        fs::write(package.join("journal.docx"), b"PK").unwrap();
        let manifest = crate::export::templates::TemplateManifest {
            schema: 1,
            id: "journal".to_string(),
            name: "Journal".to_string(),
            kind: "docx".to_string(),
            mode: crate::export::TemplateMode::ReferenceDoc,
            origin: crate::export::templates::TemplateOrigin {
                source_type: "file".to_string(),
                path: None,
                source: None,
                license: None,
                imported: None,
            },
            template: None,
            reference_doc: Some("journal.docx".to_string()),
            csl: None,
            assets: Vec::new(),
            deliver: Vec::new(),
        };
        let request = request_in(&dir);
        let arguments = pandoc_arguments(
            &dir,
            &dir.join("export.docx.yaml"),
            &dir.join("note-1.md"),
            &request,
            kind_of("docx").unwrap(),
            None,
            Some((&package, &manifest)),
            None,
        )
        .unwrap()
        .iter()
        .map(|argument| argument.to_string_lossy().into_owned())
        .collect::<Vec<String>>();
        assert!(arguments.iter().any(|argument| argument == "--reference-doc"));
        assert!(!arguments.iter().any(|argument| argument == "--template"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_library_that_is_not_there_is_not_named_at_all() {
        // Pandoc exits non-zero on a bibliography it cannot read, which would lose the whole export
        // over a setting that names a file the reader has since moved.
        let dir = scratch("no-library");
        fs::write(dir.join("library.bib"), "@article{smith2020}\n").unwrap();
        let mut request = request_in(&dir);
        assert!(named_arguments(&dir, &request).contains(&"--bibliography".to_string()));

        request.bibliography = Some(dir.join("gone.bib").to_string_lossy().into_owned());
        assert!(!named_arguments(&dir, &request).contains(&"--bibliography".to_string()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_style_at_all_is_no_style_argument() {
        let dir = scratch("no-style");
        let mut request = request_in(&dir);
        request.csl = None;
        assert!(!named_arguments(&dir, &request).contains(&"--csl".to_string()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn only_a_kind_that_carries_its_own_name_is_told_what_the_note_is_called() {
        // The window hands over the note's title and language whatever kind it is exporting, and the
        // *kind* decides: a book and a web page need them (a title page, a `<dc:title>`, a required
        // `dc:language`), while a docx whose body already opens with the note's own heading would say
        // that name twice — measured, with a title in the metadata, the docx and the odt each said
        // it twice — and a `lang` in a LaTeX run picks a hyphenation package by language.
        let dir = scratch("names");
        let request = request_in(&dir);

        let docx = named_arguments(&dir, &request);
        assert!(!docx.iter().any(|argument| argument.starts_with("title=")), "{docx:?}");
        assert!(!docx.iter().any(|argument| argument.starts_with("lang=")), "{docx:?}");

        let epub = named_arguments_for(&dir, &request, kind_of("epub").unwrap());
        assert!(epub.contains(&"--metadata".to_string()), "{epub:?}");
        assert!(epub.contains(&"title=Going out".to_string()), "{epub:?}");
        assert!(epub.contains(&"lang=en-GB".to_string()), "{epub:?}");

        // A page's own name, but no language to declare.
        let html = named_arguments_for(&dir, &request, kind_of("html").unwrap());
        assert!(html.contains(&"title=Going out".to_string()), "{html:?}");
        assert!(!html.iter().any(|argument| argument.starts_with("lang=")), "{html:?}");

        // And a note the app knows nothing about says nothing: no empty `title=`.
        let mut silent = request_in(&dir);
        silent.title = None;
        silent.language = Some("   ".to_string());
        let epub = named_arguments_for(&dir, &silent, kind_of("epub").unwrap());
        assert!(!epub.iter().any(|argument| argument.starts_with("title=")), "{epub:?}");
        assert!(!epub.iter().any(|argument| argument.starts_with("lang=")), "{epub:?}");
        let _ = fs::remove_dir_all(&dir);
    }

    /// One kind's body is not the note's own text: a book's keeps the note's own level-1 heading, and
    /// the window writes the note's name into it when the note writes none (`ui/export/book_body.ts`).
    #[test]
    fn only_a_book_is_handed_a_body_of_the_windows_making() {
        let writing: Vec<&str> = KINDS
            .iter()
            .filter(|kind| kind.names_its_body)
            .map(|kind| kind.kind)
            .collect();
        assert_eq!(writing, vec!["epub"]);
    }

    /// Only one kind's page is the app's to lay out, and the card is offered the sizes for it alone.
    #[test]
    fn only_the_kind_whose_engine_draws_a_page_is_offered_a_size_for_it() {
        let sizing: Vec<&str> = KINDS
            .iter()
            .filter(|kind| kind.takes_a_page_size)
            .map(|kind| kind.kind)
            .collect();
        assert_eq!(sizing, vec!["pdf"]);
    }

    /// The kinds whose output can hold a picture as it is — an SVG or a webp — and nothing else: a page
    /// of HTML and a book can, and the app's own hand leaves the note's destinations as written.
    #[test]
    fn only_the_kinds_that_can_hold_a_picture_as_it_is_say_they_can() {
        let pictures: Vec<&str> = KINDS
            .iter()
            .filter(|kind| kind.carries_pictures)
            .map(|kind| kind.kind)
            .collect();
        assert_eq!(pictures, vec!["html", "epub", "markdown"]);
    }

    /// A page a reader asked for is `geometry` options, and nothing at all for *the file's own*: a
    /// `papersize` on the command line is concatenated with the reader's own file instead of replacing
    /// it (`a4letterpaper`, a LaTeX warning), where geometry's options are appended after the file's
    /// and take the page with them — measured, all four of those pages (see `PAPER_SIZES`).
    #[test]
    fn a_page_a_reader_asks_for_is_a_geometry_option() {
        let dir = scratch("paper");
        let request = request_in(&dir);
        let pdf = |paper: Option<&str>, landscape: Option<bool>| {
            let request = ExportRequest {
                kind: "pdf".to_string(),
                paper: paper.map(str::to_string),
                landscape,
                ..request_in(&dir)
            };
            named_arguments_for(&dir, &request, kind_of("pdf").unwrap())
        };

        // The card's own answer: the settings file's page, and the arguments pandoc was already given.
        assert!(!pdf(None, None).contains(&"--variable".to_string()));

        assert_eq!(
            pdf(Some("letterpaper"), None)
                .iter()
                .filter(|argument| *argument == "--variable" || argument.starts_with("geometry="))
                .collect::<Vec<&String>>(),
            vec!["--variable", "geometry=letterpaper"]
        );
        // An orientation of its own is asked for as much as a size is: a file saying landscape has to
        // be able to be overruled by a reader who wants this one page portrait (measured).
        assert_eq!(
            pdf(None, Some(false))
                .iter()
                .filter(|argument| argument.starts_with("geometry="))
                .collect::<Vec<&String>>(),
            vec!["geometry=portrait"]
        );
        assert_eq!(
            pdf(None, Some(true))
                .iter()
                .filter(|argument| argument.starts_with("geometry="))
                .collect::<Vec<&String>>(),
            vec!["geometry=landscape"]
        );
        assert_eq!(
            pdf(Some("a4paper"), Some(true))
                .iter()
                .filter(|argument| argument.starts_with("geometry="))
                .collect::<Vec<&String>>(),
            vec!["geometry=a4paper", "geometry=landscape"]
        );
        // A size for a kind whose page is not the app's to lay out is nothing at all.
        let docx = ExportRequest {
            paper: Some("letterpaper".to_string()),
            landscape: Some(true),
            ..request
        };
        assert!(!named_arguments(&dir, &docx)
            .iter()
            .any(|argument| argument.starts_with("geometry=")));

        // And a size this build does not know is refused rather than handed to LaTeX.
        let request = ExportRequest {
            kind: "pdf".to_string(),
            paper: Some("tabloid".to_string()),
            ..request_in(&dir)
        };
        let refusal = pandoc_arguments(
            &dir,
            &dir.join("export.pdf.yaml"),
            &dir.join("note-1.md"),
            &request,
            kind_of("pdf").unwrap(),
            None,
            None,
            None,
        )
        .expect_err("a size that is not in the list was passed on");
        assert!(refusal.contains("tabloid"), "{refusal}");
        let _ = fs::remove_dir_all(&dir);
    }

    /// A reader who wants the keys resolved and *no list* asks for it in metadata: measured, the same
    /// word under `variables:` leaves the list exactly where it was, and a defaults file's own
    /// `metadata:` block — or this record — takes it away. A kind with no bibliography has no list to
    /// suppress, so nothing is said at all.
    #[test]
    fn a_list_the_reader_does_not_want_is_suppressed_in_metadata() {
        let dir = scratch("suppress");
        fs::write(dir.join("library.bib"), "@article{smith2020}\n").unwrap();
        let asked = named_arguments(
            &dir,
            &ExportRequest {
                suppress_references: true,
                ..request_in(&dir)
            },
        );
        let at = asked
            .iter()
            .position(|argument| argument == "suppress-bibliography=true")
            .expect("the list the reader asked away was not suppressed");
        assert_eq!(asked[at - 1], "--metadata");
        assert!(!asked.iter().any(|argument| argument.starts_with("suppress-bibliography=")
            && argument != "suppress-bibliography=true"));

        // Not asked: nothing said.
        assert!(!named_arguments(&dir, &request_in(&dir))
            .iter()
            .any(|argument| argument.starts_with("suppress-bibliography=")));
        // Asked, but with no library: nothing to suppress.
        assert!(!named_arguments(
            &dir,
            &ExportRequest {
                suppress_references: true,
                bibliography: None,
                ..request_in(&dir)
            }
        )
        .iter()
        .any(|argument| argument.starts_with("suppress-bibliography=")));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_kind_whose_output_would_be_the_note_itself_names_it_otherwise() {
        // The one row whose extension is markdown's own: its target is the note's own folder and the
        // note's own name, so without this the export would write over the document it is exporting.
        assert_eq!(kind_of("markdown").unwrap().name_suffix, ".processed");
        assert_eq!(kind_of("pdf").unwrap().name_suffix, "");
    }

    /// A template's own relative URL keeps the prefix it used: Yuki says `template/css/…`, and the
    /// asset is stored as `css/…`, so the delivery step has to know both.
    #[test]
    fn a_relative_reference_keeps_the_prefix_the_template_wrote() {
        let page = r#"<link href="template/css/template.css"><script src="template/js/template.js"></script>"#;
        assert_eq!(
            reference_to(page, "css/template.css").as_deref(),
            Some("template/css/template.css")
        );
        assert_eq!(
            reference_to(page, "js/template.js").as_deref(),
            Some("template/js/template.js")
        );
        assert_eq!(reference_to(page, "css/missing.css"), None);
        assert_eq!(reference_to(r#"<img src="https://example/x.png">"#, "x.png"), None);
        assert_eq!(reference_to(r#"<img src="../../x.png">"#, "x.png"), None);
    }

    #[test]
    fn only_a_prefix_inside_the_output_folder_is_delivered() {
        assert!(safe_prefix("template/"));
        assert!(safe_prefix(""));
        assert!(!safe_prefix("../"));
        assert!(!safe_prefix("/tmp/"));
        assert!(!safe_prefix("https://"));
    }

    #[test]
    fn a_folder_package_keeps_its_original_folder_name_as_an_alias() {
        let manifest = crate::export::templates::TemplateManifest {
            schema: 1,
            id: "yuki".to_string(),
            name: "Yuki".to_string(),
            kind: "html".to_string(),
            mode: crate::export::TemplateMode::Template,
            origin: crate::export::templates::TemplateOrigin {
                source_type: "folder".to_string(),
                path: Some("/Downloads/pandoc-templates-main/template".to_string()),
                source: None,
                license: None,
                imported: None,
            },
            template: Some("yuki.html".to_string()),
            reference_doc: None,
            csl: None,
            assets: Vec::new(),
            deliver: Vec::new(),
        };
        assert_eq!(
            crate::export::templates::alias_names(&manifest),
            vec!["template".to_string(), "yuki".to_string()]
        );
    }

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
            output_path: dir.join("out").join("note.tex").to_string_lossy().into_owned(),
            ..request_in(&dir)
        };
        deliver_latex_assets(&package, &manifest, &request).unwrap();
        assert!(dir.join("out/journal.cls").is_file());
        assert!(dir.join("out/img/logo.png").is_file());
        let _ = fs::remove_dir_all(&dir);
    }
use super::*;
use std::fs;
use std::path::Path;

