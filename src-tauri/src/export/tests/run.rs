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
use super::*;
use std::fs;
use std::path::Path;

