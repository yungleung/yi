//! Which git may run, and the writes the app makes through it.
//!
//! The git is named by `YI_GIT` or a probe, then by the known places and `PATH`; `/usr/bin/git` is
//! trusted only when the Command Line Tools answer. Identity, initialization and commits all use the
//! one command list in this module.
//!
//! May import: `std`, `tauri` and the app's i18n. Upholds: every git call is made by `run_git`, and
//! a named git that is missing is no git at all.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::Manager;

/// What a repository has configured for the reader.
#[derive(Debug, Serialize, serde::Deserialize, Clone, Default)]
pub struct Identity {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
}
/// The git the app may run, and where it was found. `from_env` is `YI_GIT`, the test seam.
pub(super) fn find_git_from(
    from_env: Option<String>,
    clt_ok: bool,
    known: &[PathBuf],
    path: Option<String>,
) -> (Option<PathBuf>, String) {
    if let Some(value) = from_env.filter(|value| !value.trim().is_empty()) {
        let named = PathBuf::from(value);
        // A name that is not there is an answer, not a fallback: a git named and quietly not run
        // would not be the git that was named. It is also how a probe asks the app for the machine
        // that has no git at all (`test/probes/versioning-no-git.js`).
        return if named.exists() {
            (Some(named), "env".to_string())
        } else {
            (None, "env-missing".to_string())
        };
    }
    if clt_ok {
        let system = PathBuf::from("/usr/bin/git");
        if system.exists() {
            return (Some(system), "clt".to_string());
        }
    }
    for (index, candidate) in known.iter().enumerate() {
        if candidate.exists() {
            return (Some(candidate.clone()), format!("known-{index}"));
        }
    }
    // Only now the shell's `PATH`, and never `/usr/bin/git` on a machine whose command line tools
    // are missing: that path is the installer's shim.
    if let Some(entries) = path {
        for entry in std::env::split_paths(&entries) {
            let candidate = entry.join("git");
            if candidate.exists() && (clt_ok || candidate != Path::new("/usr/bin/git")) {
                return (Some(candidate), "path".to_string());
            }
        }
    }
    (None, String::new())
}

/// The known places a git lives on a Mac, before `PATH` is consulted at all.
pub(super) fn known_git_locations() -> Vec<PathBuf> {
    vec![
        PathBuf::from("/opt/homebrew/bin/git"),
        PathBuf::from("/usr/local/bin/git"),
    ]
}

/// The git a probe has pointed the app at, if it has. `YI_GIT` is the same seam; this is the one a
/// caller can reach while the process is already running.
static GIT_FOR_TESTS: Mutex<Option<String>> = Mutex::new(None);

fn git_for_tests() -> Option<String> {
    GIT_FOR_TESTS.lock().ok().and_then(|named| named.clone())
}

#[cfg(target_os = "macos")]
fn command_line_tools_are_installed() -> bool {
    // Answers without prompting; `/usr/bin/git` itself raises the installer when they are not.
    Command::new("/usr/bin/xcode-select")
        .arg("-p")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
fn command_line_tools_are_installed() -> bool {
    false
}

pub fn find_git() -> (Option<PathBuf>, String) {
    find_git_from(
        git_for_tests().or_else(|| std::env::var("YI_GIT").ok()),
        command_line_tools_are_installed(),
        &known_git_locations(),
        std::env::var("PATH").ok(),
    )
}

/// Points the app at another git — `YI_GIT`, as a call, for a probe, which cannot change the
/// environment of the process it is driving. `None` puts the app back to looking for one.
///
/// Only a debug build is listenable: choosing the binary this app runs is a test's business, never
/// a shipped app's, so a release build answers with a refusal.
pub fn versioning_use_git(git: Option<String>) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err(crate::i18n::now("export.debugOnly", &[("what", "git")]));
    }
    let mut named = GIT_FOR_TESTS
        .lock()
        .map_err(|_| crate::i18n::now("versioning.gitUnusable", &[]))?;
    *named = git.filter(|value| !value.trim().is_empty());
    Ok(())
}
/// Runs one git command in `workspace`, and answers its trimmed output.
///
/// This is the only place the app runs git: everything it may ask git to do is written here and in
/// the two functions below, so "what does the app run" is one list to read — and one list to hold
/// it to (`test/probes/versioning-fake-git.js` watches every argument the app passes).
///
/// Example: `run_git(git, "/notes", &["config", "--get", "user.name"])` returns the configured
/// name without surrounding whitespace; a failed command returns git's own stderr sentence.
pub(super) fn run_git<S: AsRef<std::ffi::OsStr>>(
    git: &Path,
    workspace: &Path,
    arguments: &[S],
) -> Result<String, String> {
    let output = Command::new(git)
        .arg("-C")
        .arg(workspace)
        .args(arguments)
        .output()
        .map_err(|error| {
            crate::i18n::now(
                "app.cannotRun",
                &[
                    ("program", &git.display().to_string()),
                    ("reason", &error.to_string()),
                ],
            )
        })?;
    if !output.status.success() {
        let complaint = String::from_utf8_lossy(&output.stderr).trim().to_string();
        // git's own sentence is the useful one ("Author identity unknown", "index.lock exists");
        // only when it says nothing is the command itself worth naming.
        return Err(if complaint.is_empty() {
            format!(
                "git {} failed",
                arguments
                    .first()
                    .map(|argument| argument.as_ref().to_string_lossy().into_owned())
                    .unwrap_or_default()
            )
        } else {
            complaint
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// The git to run, or the one thing worth saying when the machine has none.
pub(super) fn git_to_run() -> Result<PathBuf, String> {
    find_git()
        .0
        .ok_or_else(|| crate::i18n::now("versioning.noGit", &[]))
}

/// What the repository has configured for the reader, when there is a repository and a git to ask.
pub(super) fn identity_of(git: Option<&Path>, workspace: &Path) -> Identity {
    let read = |key: &str| {
        let git = git?;
        let value = run_git(git, workspace, &["config", "--get", key]).ok()?;
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    };
    Identity {
        name: read("user.name"),
        email: read("user.email"),
    }
}

/// Where a repository's own directory lives when it is kept **outside** the workspace: the app's
/// data folder, under the workspace's name. That is the whole point of the arrangement — a cloud
/// client watching the workspace never sees `.git` at all.
///
/// Example: workspace `/notes/thesis` becomes `<app-data>/repos/thesis`, while a path with no
/// final folder name is refused rather than producing a repository at the data root.
pub(super) fn separate_git_dir(
    app: &tauri::AppHandle,
    workspace: &Path,
) -> Result<PathBuf, String> {
    let name = workspace
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or_else(|| {
            format!(
                "{} has no name to keep a repository under.",
                workspace.display()
            )
        })?;
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(data.join("repos").join(name))
}

/// Makes a repository for the workspace. `separate` keeps its git directory outside the folder —
/// the choice for a folder a cloud drive could reach, where the frontend's plan asks for it.
pub fn init_workspace_repository(
    app: tauri::AppHandle,
    workspace: String,
    separate: bool,
) -> Result<String, String> {
    let git = git_to_run()?;
    let folder = PathBuf::from(&workspace);
    let git_dir = if separate {
        separate_git_dir(&app, &folder)?
    } else {
        folder.join(".git")
    };
    init_repository_at(&git, &folder, separate.then_some(git_dir.as_path()))?;
    Ok(git_dir.to_string_lossy().into_owned())
}

/// `git init`, with the git directory named when it is one that lives elsewhere.
pub(super) fn init_repository_at(
    git: &Path,
    workspace: &Path,
    separate_git_dir: Option<&Path>,
) -> Result<(), String> {
    let mut arguments = vec!["init".to_string()];
    if let Some(directory) = separate_git_dir {
        arguments.push(format!("--separate-git-dir={}", directory.display()));
    }
    run_git(git, workspace, &arguments).map(|_| ())
}

/// Commits exactly `paths` — the files this app wrote — under `message`.
///
/// The pathspec on both commands is the point: a commit of ours holds the note we just saved and
/// never the reader's own staged work or their unrelated edits. `identity` is supplied only for a
/// repository the app made itself; in the reader's own repository git uses whatever they have
/// configured, and a missing identity is their git's sentence to say.
pub fn commit_paths(
    workspace: String,
    paths: Vec<String>,
    message: String,
    body: Option<String>,
    identity: Option<Identity>,
) -> Result<(), String> {
    let git = git_to_run()?;
    commit_at(
        &git,
        Path::new(&workspace),
        &paths,
        &message,
        body.as_deref(),
        identity,
    )
}

pub(super) fn commit_at(
    git: &Path,
    workspace: &Path,
    paths: &[String],
    message: &str,
    body: Option<&str>,
    identity: Option<Identity>,
) -> Result<(), String> {
    let mut identity_arguments: Vec<String> = Vec::new();
    if let Some(identity) = identity {
        for (key, value) in [("user.name", identity.name), ("user.email", identity.email)] {
            if let Some(value) = value.filter(|value| !value.trim().is_empty()) {
                identity_arguments.push("-c".to_string());
                identity_arguments.push(format!("{key}={value}"));
            }
        }
    }
    let mut add = identity_arguments.clone();
    add.extend(["add", "--"].map(String::from));
    add.extend(paths.iter().cloned());
    run_git(git, workspace, &add)?;
    let mut commit = identity_arguments;
    commit.push("commit".to_string());
    commit.push("-m".to_string());
    commit.push(message.to_string());
    // The comment the reader gave is the message's own second half — git's shape for a subject and
    // a body — and nothing is sent when they gave none.
    if let Some(body) = body.filter(|body| !body.trim().is_empty()) {
        commit.push("-m".to_string());
        commit.push(body.to_string());
    }
    commit.push("--".to_string());
    commit.extend(paths.iter().cloned());
    run_git(git, workspace, &commit).map(|_| ())
}
