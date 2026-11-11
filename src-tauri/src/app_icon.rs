//! The application icon shared by the Linux/Windows window and the Linux About dialog.
//!
//! Example: `install` gives the main window the same 512px RGBA icon named by the bundle, so a
//! development run and a packaged run show Yi rather than the toolkit fallback.
//!
//! May import: `std` and Tauri's image/window APIs. Upholds: macOS keeps its existing bundle-owned
//! icon path and the Windows About dialog receives no icon because Tauri does not support one there.

use std::error::Error;

use tauri::image::Image;
use tauri::{AppHandle, Manager};

#[cfg(any(target_os = "linux", target_os = "windows"))]
const APP_ICON: &[u8] = include_bytes!("../icons/icon.png");

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
        window.set_icon(Image::from_bytes(APP_ICON)?)?;
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
        Image::from_bytes(APP_ICON).ok()
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_about_and_window_use_a_decodable_application_icon() {
        let icon = Image::from_bytes(APP_ICON).expect("the bundled PNG decodes");
        assert_eq!((icon.width(), icon.height()), (512, 512));
        assert!(about_icon().is_some());
    }
}
