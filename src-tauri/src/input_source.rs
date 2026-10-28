/**
 * Native keyboard-input-source changes, delivered to the editor.
 *
 * macOS keeps a text control's input context until that control is rebound. The
 * editor's hidden text seam therefore needs the system notification, not another
 * key heuristic, when the reader switches from English to Chinese.
 *
 * May import: AppKit and Foundation only behind macOS; the Tauri emitter. Upholds:
 * one source-change event reaches the page and the observer lives for the app.
 */

#[cfg(target_os = "macos")]
pub fn install(app: &tauri::AppHandle) {
    use block2::RcBlock;
    use objc2_app_kit::NSTextInputContextKeyboardSelectionDidChangeNotification;
    use objc2_foundation::{NSNotification, NSNotificationCenter};
    use std::ptr::NonNull;
    use tauri::Emitter;

    let app = app.clone();
    let block = RcBlock::new(move |_notification: NonNull<NSNotification>| {
        let _ = app.emit("input_source_changed", ());
    });
    // SAFETY: the observer is registered for the lifetime of the application, the
    // notification name is AppKit's, and the block only emits a Tauri event.
    let observer = unsafe {
        NSNotificationCenter::defaultCenter().addObserverForName_object_queue_usingBlock(
            Some(NSTextInputContextKeyboardSelectionDidChangeNotification),
            None,
            None,
            &block,
        )
    };
    std::mem::forget(observer);
}

#[cfg(not(target_os = "macos"))]
pub fn install(_app: &tauri::AppHandle) {}
