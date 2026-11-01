#[test]
fn a_picture_is_named_for_its_own_type_and_never_for_a_path() {
    assert_eq!(image_extension("image/png"), Some("png"));
    assert_eq!(image_extension("image/jpeg"), Some("jpg"));
    assert_eq!(image_extension("image/svg+xml"), Some("svg"));
    assert_eq!(image_extension("image/svg+xml; charset=utf-8"), Some("svg"));
    assert_eq!(image_extension("image/webp"), Some("webp"));
    assert_eq!(image_extension("IMAGE/GIF"), None); // a server reports lower case; anything else is
    assert_eq!(image_extension("image/png; charset=binary"), Some("png"));
    assert_eq!(image_extension("text/html"), None);
    assert_eq!(image_extension(""), None);
}

#[test]
fn a_fetched_picture_can_only_name_a_file_below_its_own_folder() {
    for url in [
        "https://placehold.co/200x80/png",
        "https://example.com/a/b/pic.png?token=1#frag",
        "https://example.com/../../etc/passwd",
        "https://example.com/",
    ] {
        let name = remote_file_name(url);
        assert!(
            !name.contains('/') && !name.contains('\\') && !name.starts_with('.'),
            "{url} became {name}"
        );
    }
    // One URL is one file, so a note that names a picture twenty times fetches it once.
    assert_eq!(
        remote_file_name("https://example.com/pic.png"),
        remote_file_name("https://example.com/pic.png")
    );
    assert_ne!(
        remote_file_name("https://example.com/pic.png"),
        remote_file_name("https://example.com/other.png")
    );
}

#[test]
fn a_picture_is_fetched_from_the_web_with_its_content_type() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0_u8; 1024];
        let _ = stream.read(&mut request);
        stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\nContent-Type: image/png\r\nConnection: close\r\n\r\nPNG!"
                )
                .unwrap();
    });
    let dir = scratch("fetch");
    let url = format!("http://127.0.0.1:{port}/picture");
    let path = tauri::async_runtime::block_on(download_image(&dir, &url)).unwrap();
    assert_eq!(
        path.extension().and_then(|extension| extension.to_str()),
        Some("png")
    );
    assert_eq!(fs::read(&path).unwrap(), b"PNG!");
    server.join().unwrap();
    let _ = fs::remove_dir_all(&dir);
}

use super::*;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;
