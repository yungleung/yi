//! What is true of a folder: whether a repository is here or above it, and whether a cloud drive
//! could reach it.
//!
//! These are facts the webview cannot see, and they are read without writing anything. The answer to
//! an unreadable protected cloud folder is `unknown`, which the frontend treats like `synced`.
//!
//! May import: `std`, `tauri`, the app's git seam and i18n. Upholds: the decision gets one set of
//! facts, and every fact names the evidence it came from.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

use super::git::{find_git, identity_of, separate_git_dir, Identity};

/// The repository a folder is in, if any.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct RepositoryShape {
    pub here: bool,
    pub above: bool,
    pub toplevel: Option<String>,
}
/// Everything the decision needs.
#[derive(Debug, Serialize, Clone)]
pub struct VersioningFacts {
    pub git: Option<String>,
    pub git_source: String,
    pub repository: RepositoryShape,
    pub cloud: String,
    pub cloud_evidence: String,
    /// Where a repository of ours would keep its git directory — the app's data folder, named after
    /// the workspace — for the words that name it and for `init_workspace_repository`.
    pub separate_git_dir: Option<String>,
    pub identity: Identity,
}
/// Whether a `.git` sits in this folder — as a directory, or as the one-line file a worktree and a
/// submodule write — and whether one sits in any folder above it.
pub fn repository_shape(path: &Path) -> RepositoryShape {
    let here = path.join(".git").exists();
    let mut above = false;
    let mut toplevel: Option<String> = if here {
        Some(path.to_string_lossy().into_owned())
    } else {
        None
    };
    let mut current = path.parent();
    while let Some(folder) = current {
        if folder.join(".git").exists() {
            above = true;
            toplevel = Some(folder.to_string_lossy().into_owned());
            break;
        }
        current = folder.parent();
    }
    RepositoryShape { here, above, toplevel }
}

/// Whether a cloud drive could reach this folder, and the evidence for the answer. `home` is passed
/// rather than looked up so this is a function of its arguments and can be tested.
pub fn cloud_kind(path: &Path, home: &Path, environment: &[(String, String)]) -> (String, String) {
    let within = |prefix: &Path| path.starts_with(prefix);
    if within(&home.join("Library/CloudStorage")) {
        return (
            "cloud-storage".to_string(),
            "a folder under ~/Library/CloudStorage".to_string(),
        );
    }
    if within(&home.join("Library/Mobile Documents")) {
        return (
            "icloud".to_string(),
            "a folder under ~/Library/Mobile Documents".to_string(),
        );
    }
    // Windows is the only place a folder can be recognised by an environment variable: on macOS
    // OneDrive is a File Provider client and appears under ~/Library/CloudStorage, which the checks
    // above have already answered.
    #[cfg(windows)]
    {
        let variable = |name: &str| {
            environment
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.clone())
                .filter(|value| !value.trim().is_empty())
        };
        for name in ["OneDrive", "OneDriveCommercial", "OneDriveConsumer"] {
            if let Some(value) = variable(name) {
                if within(Path::new(&value)) {
                    return ("onedrive".to_string(), format!("a folder under %{name}%"));
                }
            }
        }
    }
    // `environment` is only read on Windows; naming it here keeps the signature honest on the other
    // platforms, where the same facts come from the path.
    let _ = environment;
    if let Ok(mounts) = fs::read_to_string("/proc/self/mountinfo") {
        let folder = path.to_string_lossy();
        for line in mounts.lines() {
            let mut fields = line.split_whitespace();
            let point = fields.nth(4);
            let kind = fields.next();
            if let (Some(point), Some(kind)) = (point, kind) {
                let cloud_mount = kind.starts_with("fuse")
                    || kind.contains("gvfs")
                    || kind.contains("rclone")
                    || kind.contains("davfs")
                    || kind.contains("dav");
                if cloud_mount && !point.is_empty() && folder.starts_with(point) {
                    return ("mount".to_string(), format!("a {kind} mount at {point}"));
                }
            }
        }
    }
    // macOS refuses `readdir` on a protected cloud path while `stat` still answers, so a folder we
    // cannot list under ~/Library is a cloud folder we are not allowed to look at.
    if within(&home.join("Library")) {
        if let Err(error) = fs::read_dir(path) {
            if error.kind() == std::io::ErrorKind::PermissionDenied {
                return (
                    "unknown".to_string(),
                    "a folder under ~/Library the app is not allowed to read".to_string(),
                );
            }
        }
    }
    // A file the cloud client has not downloaded yet, where the folder itself is readable.
    if content_is_offloaded(path) {
        return (
            "unknown".to_string(),
            "a folder holding files that are not downloaded".to_string(),
        );
    }
    ("none".to_string(), "an ordinary folder".to_string())
}

/// Whether the folder's first entry is a placeholder the cloud client has not fetched.
#[cfg(target_os = "macos")]
fn content_is_offloaded(path: &Path) -> bool {
    use std::os::macos::fs::MetadataExt;
    const UF_DATALESS: u32 = 0x4000_0000;
    let Ok(entries) = fs::read_dir(path) else {
        return false;
    };
    for entry in entries.flatten().take(8) {
        if let Ok(metadata) = entry.metadata() {
            if metadata.st_flags() & UF_DATALESS != 0 {
                return true;
            }
        }
    }
    false
}

#[cfg(target_os = "windows")]
fn content_is_offloaded(path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_OFFLINE: u32 = 0x1000;
    const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS: u32 = 0x0040_0000;
    let Ok(entries) = fs::read_dir(path) else {
        return false;
    };
    for entry in entries.flatten().take(8) {
        if let Ok(metadata) = entry.metadata() {
            let attributes = metadata.file_attributes();
            if attributes & (FILE_ATTRIBUTE_OFFLINE | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS) != 0 {
                return true;
            }
        }
    }
    false
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn content_is_offloaded(_path: &Path) -> bool {
    false
}
/// Everything the versioning decision needs about this folder.
pub fn versioning_facts(app: tauri::AppHandle, workspace: String) -> Result<VersioningFacts, String> {
    let folder = PathBuf::from(&workspace);
    let (git, git_source) = find_git();
    let home = dirs_home();
    let environment: Vec<(String, String)> = std::env::vars().collect();
    let (cloud, cloud_evidence) = match &home {
        Some(home) => cloud_kind(&folder, home, &environment),
        None => ("unknown".to_string(), "no home folder to compare against".to_string()),
    };
    // A workspace with no name of its own cannot have a repository of ours; the words then simply
    // have no path to show, and the plan never asks for one.
    let separate = separate_git_dir(&app, &folder)
        .ok()
        .map(|dir| dir.to_string_lossy().into_owned());
    Ok(VersioningFacts {
        repository: repository_shape(&folder),
        identity: identity_of(git.as_deref(), &folder),
        git: git.map(|path| path.to_string_lossy().into_owned()),
        git_source,
        cloud,
        cloud_evidence,
        separate_git_dir: separate,
    })
}

/// The reader's home folder, asked of the platform rather than guessed.
fn dirs_home() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}
