//! The session file: which documents a reader has open, and where they were in them.
//!
//! This side only holds the text. What a session *is* — a document, its stack, its text and
//! its view — is the frontend's model (`src/services/session_rules.ts`), which writes what
//! it wants kept and discards a file it cannot read. So there is no shape to parse here, and
//! nothing to migrate: one reader of the format, in one place.
//!
//! The write is atomic — `files/atomic.rs` holds the one shape for it — because a session is the reader's
//! work in progress, and a half-written one is worth nothing to anybody.

use std::{fs, path::Path, path::PathBuf};
use tauri::Manager;

/// The session file inside the app's data directory.
fn session_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("session.json")
}

/// The file's text, or `None` when there is no session yet.
fn read(path: &Path) -> anyhow::Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// Replaces the file's text. The temporary file is written first, so a crash mid-write leaves
/// the session that was there rather than half of the next one.
fn write(path: &Path, text: &str) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    crate::files::write_atomically(path, text)?;
    Ok(())
}

#[tauri::command]
pub fn load_session(app: tauri::AppHandle) -> Result<Option<String>, String> {
    read(&session_path(&app)).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_session(app: tauri::AppHandle, session: String) -> Result<(), String> {
    write(&session_path(&app), &session).map_err(|error| error.to_string())
}

/// Brings the app's window to the front — the one thing a probe cannot do for itself.
///
/// The system **throttles a background window's timers**, so a probe's own `sleep` can cost two or
/// three times what it says: measured while the versioning probes were written, the same probe in the
/// same state took **2257 ms** with the window in front and **5008 ms** behind a terminal. A probe that
/// only sometimes finishes inside the bridge's budget is read as too slow whatever the window was
/// doing, which is why the harness calls this before every run (`test/tauri-probe.mjs`) rather than
/// leaving it to whoever types the command.
#[tauri::command]
pub fn focus_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "the app has no main window".to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{read, write};

    #[test]
    fn a_session_that_was_never_written_reads_as_nothing() {
        let directory = std::env::temp_dir().join("yi-session-missing");
        let path = directory.join("session.json");
        let _ = std::fs::remove_dir_all(&directory);
        assert_eq!(read(&path).unwrap(), None);
    }

    #[test]
    fn a_session_round_trips_and_leaves_no_temporary_behind() {
        let directory = std::env::temp_dir().join("yi-session-round-trip");
        let path = directory.join("session.json");
        let _ = std::fs::remove_dir_all(&directory);

        let text = r#"{"version":1,"current":"a","documents":[]}"#;
        write(&path, text).unwrap();
        assert_eq!(read(&path).unwrap().as_deref(), Some(text));
        assert!(!path.with_extension("json.tmp").exists());

        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn a_second_write_replaces_the_first() {
        let directory = std::env::temp_dir().join("yi-session-replace");
        let path = directory.join("session.json");
        let _ = std::fs::remove_dir_all(&directory);

        write(&path, "first").unwrap();
        write(&path, "second").unwrap();
        assert_eq!(read(&path).unwrap().as_deref(), Some("second"));

        let _ = std::fs::remove_dir_all(&directory);
    }
}
