/**
 * Native keyboard-input-source changes, delivered to the editor.
 *
 * A text control keeps its native input context until that control is rebound. The
 * editor's hidden text seam therefore needs the system notification, not another
 * key heuristic, when the reader switches input source.
 *
 * May import: AppKit on macOS, the Win32 window API on Windows, the desktop bus
 * input APIs on Linux, and the Tauri emitter. Upholds: one platform-specific
 * observer turns a source change into the same event for the page, and lives for
 * the application.
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

#[cfg(target_os = "windows")]
pub fn install(app: &tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::WM_INPUTLANGCHANGE;

    const SUBCLASS_ID: usize = 0x5949; // "YI"

    unsafe extern "system" fn input_language_changed(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _subclass_id: usize,
        app: usize,
    ) -> LRESULT {
        if message == WM_INPUTLANGCHANGE {
            // SAFETY: `app` is the leaked AppHandle stored by `install`.
            let app = unsafe { &*(app as *const tauri::AppHandle) };
            let _ = app.emit("input_source_changed", ());
        }
        // SAFETY: every message is forwarded to the window's previous procedure.
        unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
    }

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    // Windows sends WM_INPUTLANGCHANGE to the top-level window when its keyboard
    // layout changes. The webview keeps handling the message through our callback.
    let app = Box::into_raw(Box::new(app.clone()));
    // SAFETY: the window outlives the application and the leaked AppHandle is the
    // callback's stable user data. The subclass is never removed during the run.
    let installed = unsafe {
        SetWindowSubclass(
            hwnd,
            Some(input_language_changed),
            SUBCLASS_ID,
            app as usize,
        )
    };
    if !installed.as_bool() {
        // SAFETY: ownership returns to us when the subclass was not installed.
        unsafe { drop(Box::from_raw(app)) };
    }
}

#[cfg(target_os = "linux")]
pub fn install(app: &tauri::AppHandle) {
    use futures_util::TryStreamExt;
    use tauri::Emitter;
    use zbus::{Connection, MatchRule, MessageStream};

    const SIGNALS: &[(&str, &str)] = &[
        // IBus and both Fcitx generations. Watching the signals on the session bus
        // avoids identifying a particular input-method daemon in application code.
        ("org.freedesktop.IBus", "GlobalEngineChanged"),
        ("org.fcitx.Fcitx.Controller1", "InputMethodGroupChanged"),
        ("org.fcitx.Fcitx.Controller1", "CurrentInputMethodChanged"),
        ("org.fcitx.Fcitx.InputMethod", "IMChanged"),
    ];

    for &(interface, member) in SIGNALS {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let Ok(connection) = Connection::session().await else {
                return;
            };
            let Ok(rule) = MatchRule::builder()
                .msg_type(zbus::message::Type::Signal)
                .interface(interface)
                .and_then(|rule| rule.member(member))
            else {
                return;
            };
            let Ok(mut stream) =
                MessageStream::for_match_rule(rule.build(), &connection, None).await
            else {
                return;
            };
            while let Ok(Some(_)) = stream.try_next().await {
                let _ = app.emit("input_source_changed", ());
            }
        });
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn install(_app: &tauri::AppHandle) {}
