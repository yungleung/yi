//! Reading the system clipboard.
//!
//! The webview has a clipboard API of its own (`navigator.clipboard.readText`), but on
//! macOS WebKit answers a read from script with its own paste confirmation — the editor
//! did not ask the reader for a gesture, it only asked a button to fill a URL — so the
//! text is read natively instead, through AppKit's general pasteboard. That is also what
//! makes the read silent: the app is the frontmost application, and it is reading its own
//! user's clipboard on their behalf.
//!
//! Everything here is macOS-only. Other platforms answer `None`, which the frontend
//! treats as "no text" and falls back to the webview's own API for.

/// The clipboard's text, or `None` when it holds none (or this is not macOS).
#[tauri::command]
pub fn read_clipboard_text() -> Option<String> {
    platform::clipboard_text()
}

#[cfg(target_os = "macos")]
mod platform {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};

    /// The string on the general pasteboard, if it holds one.
    pub fn clipboard_text() -> Option<String> {
        // The pasteboard type is an AppKit constant. Reading it is the one `unsafe`
        // operation here; the calls around it are the framework's own safe bindings.
        let kind = unsafe { NSPasteboardTypeString };
        let pasteboard = NSPasteboard::generalPasteboard();
        pasteboard.stringForType(kind).map(|text| text.to_string())
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    pub fn clipboard_text() -> Option<String> {
        None
    }
}
