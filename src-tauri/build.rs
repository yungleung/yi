fn main() {
    // The native menu's words are `include_str!`-ed from the repository's catalogues at compile
    // time. Cargo watches this crate, not the folder above it, so without this a locale edit leaves
    // the binary serving an old catalogue — the new menu item then shows its key.
    println!("cargo:rerun-if-changed=../locales");
    tauri_build::build()
}
