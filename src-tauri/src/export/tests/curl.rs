    #[test]
    fn a_curl_named_by_the_test_seam_is_the_one_that_is_run() {
        let here = std::env::current_exe().unwrap();
        let (found, source) = find_pandoc_from(
            Some(here.to_string_lossy().into_owned()),
            &[],
            Some("/nowhere".to_string()),
        );
        assert_eq!(found, Some(here));
        assert_eq!(source, "env");
    }
use super::*;
