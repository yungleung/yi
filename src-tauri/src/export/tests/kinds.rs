    #[test]
    fn a_kinds_config_file_is_named_for_the_kind() {
        assert_eq!(config_file_name("docx"), "export.docx.yaml");
    }

    #[test]
    fn a_kind_the_app_does_not_ship_is_refused_by_name() {
        // `rtf` is the writer this test is written against: one no kind of ours will ever be, so the
        // list below is the thing that ages — and adding a kind makes this test say so (it has, three
        // times: `odt`, `latex`, `html`, each one moved the example along).
        let refused = kind_of("rtf").expect_err("rtf is not a kind this build ships");
        assert!(refused.contains("rtf"), "{refused}");
        for shipped in ["docx", "odt", "latex", "html", "epub", "revealjs", "beamer"] {
            assert!(kind_of(shipped).is_ok(), "{shipped} is not shipped");
        }
    }

    #[test]
    fn presentation_kinds_use_pandoc_without_template_packages() {
        for name in ["revealjs", "beamer"] {
            let kind = kind_of(name).expect("presentation kind");
            assert!(kind.needs_pandoc);
            assert_eq!(kind.template_mode, KindTemplate::None);
        }
        assert_eq!(kind_of("revealjs").unwrap().extension, "html");
        assert_eq!(kind_of("beamer").unwrap().extension, "pdf");
    }

    #[test]
    fn every_shipped_kind_names_the_reader_and_writer_pandoc_is_given_and_the_file_that_comes_out() {
        // The asset is pandoc's own input, so the one thing worth holding it to is that it still
        // says which reader and writer it is for: a defaults file that lost its `writer` would
        // export the reader's note as pandoc's own default format, silently.
        //
        // The *extension* is the app's own fact and cannot be read off the file — `latex` writes a
        // `.tex`, and docx and odt happen to be named after their writers — so pandoc's names are
        // written down once, here, which is what keeps a row and its asset from drifting apart.
        let produced_by = |writer: &str| match writer {
            "docx" => "docx",
            "odt" => "odt",
            "latex" => "tex",
            "html" => "html",
            "revealjs" => "html",
            "epub" => "epub",
            "pdf" => "pdf",
            "beamer" => "pdf",
            "markdown" => "md",
            _ => "",
        };
        // The `markdown` kind ships none at all: its conversion is the app's own, which
        // `the_kind_pandoc_does_not_write_is_the_kind_with_no_defaults_file` holds the other way.
        for kind in KINDS.iter().filter(|kind| !kind.defaults.is_empty()) {
            assert!(
                kind.defaults.contains("reader: markdown"),
                "{} defaults do not name markdown as the reader",
                kind.kind
            );
            let writer = kind
                .defaults
                .lines()
                .find_map(|line| line.strip_prefix("writer: "))
                .map(str::trim)
                .unwrap_or("");
            assert_eq!(writer, kind.kind, "{} defaults name another writer", kind.kind);
            assert_eq!(
                produced_by(writer),
                kind.extension,
                "{} is written under the wrong extension",
                kind.kind
            );
        }
    }

    #[test]
    fn every_kind_has_the_export_manager_group_that_owns_it() {
        use crate::export::kinds::ExportGroup;

        let expected = [
            ("docx", ExportGroup::Documents),
            ("odt", ExportGroup::Documents),
            ("latex", ExportGroup::Documents),
            ("html", ExportGroup::Documents),
            ("revealjs", ExportGroup::Presentations),
            ("epub", ExportGroup::Documents),
            ("pdf", ExportGroup::Documents),
            ("beamer", ExportGroup::Presentations),
            ("markdown", ExportGroup::Other),
        ];

        assert_eq!(
            crate::export::KINDS
                .iter()
                .map(|kind| (kind.kind, kind.group))
                .collect::<Vec<_>>(),
            expected
        );
    }

use super::*;

