//! The application icon and Linux desktop identity.
//!
//! Example: an unpackaged run writes `$XDG_DATA_HOME/applications/Yi.desktop` so GNOME can match
//! its Wayland app ID `Yi` to the Yi icon; an installed package already supplies that entry.
//!
//! May import: `std`, `dirs` and Tauri's image/window APIs. Upholds: macOS keeps its existing
//! bundle-owned icon path, the Windows About dialog receives no icon, and Linux writes desktop
//! integration only when no installed entry owns the `Yi` application ID.

use std::error::Error;

use tauri::image::Image;
use tauri::{AppHandle, Manager};

#[cfg(any(target_os = "linux", target_os = "windows"))]
const WINDOW_ICON: &[u8] = include_bytes!("../icons/icon.png");

#[cfg(target_os = "linux")]
const ABOUT_ICON: &[u8] = include_bytes!("../icons/64x64.png");

#[cfg(target_os = "linux")]
const DESKTOP_ICONS: &[(&str, &[u8])] = &[
    ("32x32", include_bytes!("../icons/32x32.png")),
    ("128x128", include_bytes!("../icons/128x128.png")),
    ("256x256", include_bytes!("../icons/128x128@2x.png")),
];

#[cfg(target_os = "linux")]
const DESKTOP_FILE_NAME: &str = "Yi.desktop";

#[cfg(target_os = "linux")]
const GENERATED_MARKER: &str = "X-Yi-Generated=true";

/// Sets the main window's runtime icon on the desktops whose dock/taskbar reads it.
pub(crate) fn install_window_icon(app: &AppHandle) -> Result<(), Box<dyn Error>> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    {
        let window = app.get_webview_window("main").ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "the main webview window is not available",
            )
        })?;
        // Example: the 64px About asset does not shrink the window's full-resolution 512px PNG.
        window.set_icon(Image::from_bytes(WINDOW_ICON)?)?;
    }
    Ok(())
}

/// The About-dialog icon where Tauri supports one.
///
/// Tauri documents `AboutMetadata.icon` as Linux-supported and Windows-unsupported. macOS is
/// deliberately left on its existing bundle-owned icon path.
pub(crate) fn about_icon() -> Option<Image<'static>> {
    #[cfg(target_os = "linux")]
    {
        // Example: GTK reports a 64x64 source image instead of scaling the 512px window icon.
        Image::from_bytes(ABOUT_ICON).ok()
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

/// Gives an unpackaged Linux build the launcher identity its Wayland app ID names.
///
/// Example: `APPIMAGE=/opt/Yi.AppImage` writes an entry whose `Exec` launches that file; a run
/// from `target/debug/Yi` writes that binary instead. Failures are cosmetic, so they are logged
/// rather than preventing the app from opening.
#[cfg(target_os = "linux")]
pub(crate) fn install_linux_desktop_identity() {
    if let Err(error) = ensure_linux_desktop_identity() {
        eprintln!("could not install Linux desktop identity: {error}");
    }
}

#[cfg(target_os = "linux")]
fn ensure_linux_desktop_identity() -> std::io::Result<()> {
    let data_home = dirs::data_dir().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "the XDG data directory is not available",
        )
    })?;
    let executable = std::env::var_os("APPIMAGE")
        .filter(|path| !path.is_empty())
        .map(std::path::PathBuf::from)
        .map(Ok)
        .unwrap_or_else(std::env::current_exe)?;
    let app_dir = std::env::var_os("APPDIR")
        .filter(|path| !path.is_empty())
        .map(std::path::PathBuf::from);
    ensure_linux_desktop_entry(
        &data_home,
        &xdg_data_dirs(),
        &executable,
        app_dir.as_deref(),
    )
}

#[cfg(target_os = "linux")]
fn ensure_linux_desktop_entry(
    data_home: &std::path::Path,
    data_dirs: &[std::path::PathBuf],
    executable: &std::path::Path,
    app_dir: Option<&std::path::Path>,
) -> std::io::Result<()> {
    use std::fs;

    let entry = data_home.join("applications").join(DESKTOP_FILE_NAME);
    if entry.exists() {
        let generated = fs::read_to_string(&entry)
            .map(|text| text.contains(GENERATED_MARKER))
            .unwrap_or(false);
        if !generated {
            return Ok(());
        }
    } else if installed_desktop_entry_exists(data_home, data_dirs, app_dir) {
        return Ok(());
    }

    for (size, bytes) in DESKTOP_ICONS {
        write_if_changed(
            &data_home
                .join("icons/hicolor")
                .join(size)
                .join("apps/Yi.png"),
            bytes,
        )?;
    }

    write_if_changed(&entry, desktop_entry(executable).as_bytes())
}

#[cfg(target_os = "linux")]
fn xdg_data_dirs() -> Vec<std::path::PathBuf> {
    let data_dirs = std::env::var_os("XDG_DATA_DIRS")
        .filter(|value| !value.is_empty())
        .into_iter()
        .flat_map(|value| std::env::split_paths(&value).collect::<Vec<_>>())
        .collect::<Vec<_>>();
    let data_dirs = if data_dirs.is_empty() {
        vec![
            std::path::PathBuf::from("/usr/local/share"),
            std::path::PathBuf::from("/usr/share"),
        ]
    } else {
        data_dirs
    };
    data_dirs
}

#[cfg(target_os = "linux")]
fn installed_desktop_entry_exists(
    data_home: &std::path::Path,
    data_dirs: &[std::path::PathBuf],
    app_dir: Option<&std::path::Path>,
) -> bool {
    data_dirs
        .iter()
        .filter(|directory| directory.as_path() != data_home)
        .filter(|directory| app_dir.is_none_or(|base| !directory.starts_with(base)))
        .any(|directory| {
            directory
                .join("applications")
                .join(DESKTOP_FILE_NAME)
                .exists()
        })
}

#[cfg(target_os = "linux")]
fn desktop_entry(executable: &std::path::Path) -> String {
    let executable = executable.to_string_lossy();
    let executable = executable
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('`', "\\`")
        .replace('$', "\\$")
        .replace('%', "%%");
    format!(
        "[Desktop Entry]\n\
         {GENERATED_MARKER}\n\
         Type=Application\n\
         Name=Yi\n\
         Comment=A Versatile Note App\n\
         Exec=\"{executable}\"\n\
         Icon=Yi\n\
         Terminal=false\n\
         Categories=Utility;TextEditor;\n\
         StartupWMClass=Yi\n"
    )
}

#[cfg(target_os = "linux")]
fn write_if_changed(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    if std::fs::read(path).ok().as_deref() == Some(bytes) {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_about_and_window_use_their_intended_icon_sizes() {
        let window = Image::from_bytes(WINDOW_ICON).expect("the bundled PNG decodes");
        let about = about_icon().expect("the About PNG decodes");
        assert_eq!((window.width(), window.height()), (512, 512));
        assert_eq!((about.width(), about.height()), (64, 64));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_platform_icon_keeps_the_transparent_dock_margin() {
        let icon = Image::from_bytes(WINDOW_ICON).expect("the bundled PNG decodes");
        let rgba = icon.rgba();
        let alpha = |x: u32, y: u32| rgba[((y * icon.width() + x) * 4 + 3) as usize];

        for (x, y) in [(0, 0), (511, 0), (0, 511), (511, 511)] {
            assert_eq!(alpha(x, y), 0, "corner ({x}, {y}) stays transparent");
        }
        assert!(alpha(45, 256) == 0, "the left margin stays transparent");
        assert!(
            alpha(46, 256) > 0,
            "the rounded content begins after the margin"
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn unpackaged_linux_run_writes_the_desktop_entry_and_theme_icons() {
        use std::fs;

        let root = std::env::temp_dir().join(format!("yi-desktop-icon-{}", std::process::id()));
        let data_home = root.join("data");
        let executable = root.join("Yi App/Yi");
        let _ = fs::remove_dir_all(&root);

        ensure_linux_desktop_entry(&data_home, &[], &executable, None)
            .expect("desktop identity is written");

        let entry = fs::read_to_string(data_home.join("applications/Yi.desktop")).unwrap();
        assert!(entry.contains("Exec=\""));
        assert!(entry.contains("Yi App/Yi\""));
        assert!(entry.contains("Icon=Yi"));
        assert!(entry.contains("StartupWMClass=Yi"));
        assert!(data_home.join("icons/hicolor/32x32/apps/Yi.png").is_file());
        assert!(data_home
            .join("icons/hicolor/256x256/apps/Yi.png")
            .is_file());

        let _ = fs::remove_dir_all(root);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn an_installed_desktop_entry_keeps_ownership_of_the_app_id() {
        use std::fs;

        let root = std::env::temp_dir().join(format!("yi-installed-icon-{}", std::process::id()));
        let data_home = root.join("data");
        let system_data = root.join("system");
        fs::create_dir_all(system_data.join("applications")).unwrap();
        fs::write(system_data.join("applications/Yi.desktop"), "installed").unwrap();

        ensure_linux_desktop_entry(&data_home, &[system_data], &root.join("Yi"), None).unwrap();

        assert!(!data_home.join("applications/Yi.desktop").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn an_appimage_mounted_entry_does_not_block_user_integration() {
        use std::fs;

        let root = std::env::temp_dir().join(format!("yi-appimage-icon-{}", std::process::id()));
        let data_home = root.join("data");
        let app_dir = root.join("mount");
        let bundled_data = app_dir.join("usr/share");
        fs::create_dir_all(bundled_data.join("applications")).unwrap();
        fs::write(bundled_data.join("applications/Yi.desktop"), "bundled").unwrap();

        ensure_linux_desktop_entry(
            &data_home,
            &[bundled_data],
            &root.join("Yi.AppImage"),
            Some(&app_dir),
        )
        .unwrap();

        assert!(data_home.join("applications/Yi.desktop").exists());
        let _ = fs::remove_dir_all(root);
    }
}
