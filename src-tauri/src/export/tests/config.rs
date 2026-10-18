    #[test]
    fn a_copy_the_build_ships_is_known_to_be_that_one() {
        let dir = scratch("config-is-shipped");
        let kind = &KINDS[0];

        // No file yet: the shipped bytes are what an export would use, and there is nothing to
        // replace — the card asks `config_exists` as well, so nothing is offered.
        assert!(!kind_info(&dir, kind).config_exists);
        assert!(kind_info(&dir, kind).config_is_shipped);

        // The copy this build wrote is that one, byte for byte: nothing to replace.
        ensure_defaults_in(&dir, kind).unwrap();
        assert!(kind_info(&dir, kind).config_exists);
        assert!(kind_info(&dir, kind).config_is_shipped);

        // An edit changes that — and so would a copy written by an older build, which is why the card
        // says what the button does rather than claiming to know which of the two it is looking at.
        fs::write(dir.join("export.docx.yaml"), "# edited\n").unwrap();
        assert!(kind_info(&dir, kind).config_exists);
        assert!(!kind_info(&dir, kind).config_is_shipped);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_defaults_file_is_written_once_and_an_edited_one_is_kept() {
        let dir = std::env::temp_dir().join(format!("yi-export-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let kind = &KINDS[0];

        let written = ensure_defaults_in(&dir, kind).unwrap();
        assert_eq!(written, dir.join("export.docx.yaml"));
        assert_eq!(fs::read_to_string(&written).unwrap(), kind.defaults);

        fs::write(&written, "# edited\n").unwrap();
        let again = ensure_defaults_in(&dir, kind).unwrap();
        assert_eq!(again, written);
        assert_eq!(fs::read_to_string(&written).unwrap(), "# edited\n");

        let _ = fs::remove_dir_all(&dir);
    }
    #[test]
    fn the_kind_pandoc_does_not_write_is_the_kind_with_no_defaults_file() {
        // One fact, one home: a row that says the app writes this kind says it by having nothing to
        // hand pandoc, and a row pandoc writes always has something. A kind added with one and not
        // the other says so here.
        for kind in KINDS {
            assert_eq!(
                kind.defaults.is_empty(),
                !kind.needs_pandoc,
                "{} says pandoc writes it while shipping no defaults file, or the other way round",
                kind.kind
            );
        }
    }

    #[test]
    fn a_style_lands_in_a_file_named_for_the_style_and_nowhere_else() {
        assert_eq!(style_file_name("apa"), "apa");
        assert_eq!(style_file_name("harvard1"), "harvard1");
        // A config value a reader may type anything into: what it cannot do is name a file outside
        // the folder its styles are kept in, or a hidden one.
        for dangerous in ["../../evil", "/etc/passwd", "..", ".hidden", "", "  "] {
            let name = style_file_name(dangerous);
            assert!(
                !name.contains('/') && !name.contains('\\') && name != ".." && !name.starts_with('.'),
                "{dangerous} became {name}"
            );
        }
    }

    #[test]
    fn the_style_is_written_once_and_replaced_when_the_style_changes() {
        let dir = scratch("csl");
        let mut style = CslStyle {
            name: "apa".to_string(),
            xml: "<style>one</style>".to_string(),
        };

        let written = ensure_csl_in(&dir, &style).unwrap();
        assert_eq!(written, dir.join("styles/apa.csl"));
        assert_eq!(fs::read_to_string(&written).unwrap(), "<style>one</style>");

        style.xml = "<style>two</style>".to_string();
        assert_eq!(ensure_csl_in(&dir, &style).unwrap(), written);
        assert_eq!(fs::read_to_string(&written).unwrap(), "<style>two</style>");

        let _ = fs::remove_dir_all(&dir);
    }
use super::*;

