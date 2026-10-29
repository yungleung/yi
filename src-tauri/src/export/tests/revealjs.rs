use super::*;
use super::run::{named_arguments, request_in};

#[test]
fn revealjs_output_is_a_folder_with_a_named_page() {
    let root = scratch("revealjs-output");
    let (bundle, page) = revealjs_output(root.join("talk").to_str().unwrap()).unwrap();
    assert_eq!(bundle, root.join("talk"));
    assert_eq!(page, bundle.join("talk.html"));
    assert!(bundle.is_dir());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn revealjs_asset_paths_stay_below_js_dist() {
    assert_eq!(
        reveal_asset_path("js/dist/reveal.js").unwrap(),
        PathBuf::from("js/dist/reveal.js")
    );
    assert_eq!(
        reveal_asset_path("js/dist/theme/black.css").unwrap(),
        PathBuf::from("js/dist/theme/black.css")
    );
    assert!(reveal_asset_path("../secret").is_err());
    assert!(reveal_asset_path("images/shot.png").is_err());
    assert!(reveal_asset_path("/js/dist/reveal.js").is_err());
}

#[test]
fn revealjs_local_asset_references_are_unique() {
    let html = r#"
      <link href="js/dist/reveal.css">
      <script src="js/dist/reveal.js"></script>
      <script src="js/dist/reveal.js"></script>
      <script src="https://unpkg.com/reveal.js/dist/reveal.js"></script>
      <img src="images/shot.png">
    "#;
    assert_eq!(
        revealjs_asset_references(html),
        vec![
            PathBuf::from("js/dist/reveal.css"),
            PathBuf::from("js/dist/reveal.js")
        ]
    );
}

#[test]
fn revealjs_local_mode_names_a_relative_distribution_folder() {
    let dir = scratch("revealjs-assets");
    let mut request = request_in(&dir);
    request.kind = "revealjs".to_string();
    let local = named_arguments(&dir, &request);
    assert!(local.iter().any(|argument| argument == "revealjs-url=js"));

    request.revealjs_remote_js = true;
    let remote = named_arguments(&dir, &request);
    assert!(!remote.iter().any(|argument| argument == "revealjs-url=js"));
    assert!(remote.iter().any(|argument| {
        argument == "revealjs-url=https://unpkg.com/reveal.js@6.0.1"
    }));
    let _ = fs::remove_dir_all(dir);
}
