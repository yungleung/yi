//! What is true of the machine and a folder, for the versioning decision.
//!
//! The decision itself is pure and lives in the frontend (`src/services/versioning.ts`); this module
//! only answers questions of fact, and every one of them is something the webview cannot see:
//!
//! - **which git may be run.** Never by trusting `PATH`: an app launched from Finder does not inherit
//!   a shell's `PATH` at all. The known places are searched in order, and `/usr/bin/git` is trusted
//!   only when `xcode-select -p` answers, because on a machine without the Command Line Tools that
//!   path is a shim that raises the system's installer — a dialog our process must never open by
//!   accident. `YI_GIT` comes first, which is how a probe points the app at a script that records
//!   what it was asked to do.
//! - **whether the folder is in a repository**, its own or one above it, and that a worktree writes
//!   `.git` as a one-line *file* rather than a directory.
//! - **whether a cloud drive could reach it**, by the path shapes the operating systems use
//!   (`~/Library/CloudStorage`, `~/Library/Mobile Documents`, `%OneDrive%`, a `fuse` mount), by the
//!   dataless and placeholder attributes, and — for macOS, where a protected cloud path answers
//!   `stat` but refuses `readdir` — by that refusal itself. What cannot be told (an rsync job, a
//!   folder another machine syncs, iCloud's "Desktop & Documents") reads as `unknown`, and the
//!   frontend treats that exactly like *synced*.
//! - **the identity** a repository has configured, so a commit into the reader's own repository can
//!   use their name and never invent one.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// The repository a folder is in, if any.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct RepositoryShape {
    pub here: bool,
    pub above: bool,
    pub toplevel: Option<String>,
}

/// What a repository has configured for the reader.
#[derive(Debug, Serialize, Clone, Default)]
pub struct Identity {
    pub name: Option<String>,
    pub email: Option<String>,
}

/// Everything the decision needs.
#[derive(Debug, Serialize, Clone)]
pub struct VersioningFacts {
    pub git: Option<String>,
    pub git_source: String,
    pub repository: RepositoryShape,
    pub cloud: String,
    pub cloud_evidence: String,
    pub identity: Identity,
}

/// The git the app may run, and where it was found. `from_env` is `YI_GIT`, the test seam.
fn find_git_from(from_env: Option<String>, clt_ok: bool, known: &[PathBuf], path: Option<String>) -> (Option<PathBuf>, String) {
    if let Some(value) = from_env.filter(|value| !value.trim().is_empty()) {
        return (Some(PathBuf::from(value)), "env".to_string());
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
fn known_git_locations() -> Vec<PathBuf> {
    vec![
        PathBuf::from("/opt/homebrew/bin/git"),
        PathBuf::from("/usr/local/bin/git"),
    ]
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
        std::env::var("YI_GIT").ok(),
        command_line_tools_are_installed(),
        &known_git_locations(),
        std::env::var("PATH").ok(),
    )
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

/// What the repository has configured for the reader, when there is a repository and a git to ask.
fn identity_of(git: Option<&Path>, workspace: &Path) -> Identity {
    let read = |key: &str| {
        let git = git?;
        let output = Command::new(git)
            .arg("-C")
            .arg(workspace)
            .args(["config", "--get", key])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
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

/// Everything the versioning decision needs about this folder.
#[tauri::command]
pub fn versioning_facts(workspace: String) -> Result<VersioningFacts, String> {
    let folder = PathBuf::from(&workspace);
    let (git, git_source) = find_git();
    let home = dirs_home();
    let environment: Vec<(String, String)> = std::env::vars().collect();
    let (cloud, cloud_evidence) = match &home {
        Some(home) => cloud_kind(&folder, home, &environment),
        None => ("unknown".to_string(), "no home folder to compare against".to_string()),
    };
    Ok(VersioningFacts {
        repository: repository_shape(&folder),
        identity: identity_of(git.as_deref(), &folder),
        git: git.map(|path| path.to_string_lossy().into_owned()),
        git_source,
        cloud,
        cloud_evidence,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_from_the_environment_wins_over_every_other_place() {
        let (found, source) = find_git_from(
            Some("/tmp/fake-git".to_string()),
            true,
            &[PathBuf::from("/opt/homebrew/bin/git")],
            Some("/usr/bin".to_string()),
        );
        assert_eq!(found, Some(PathBuf::from("/tmp/fake-git")));
        assert_eq!(source, "env");
    }

    #[test]
    fn the_system_git_is_only_trusted_when_the_command_line_tools_answer() {
        let (found, _) = find_git_from(None, false, &[], Some("/usr/bin".to_string()));
        assert_ne!(found, Some(PathBuf::from("/usr/bin/git")));
    }

    #[test]
    fn a_worktree_repository_is_a_folder_with_a_dot_git_file() {
        let directory = std::env::temp_dir().join("yi-versioning-worktree");
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join(".git"), "gitdir: /elsewhere\n").unwrap();

        let shape = repository_shape(&directory);
        assert!(shape.here);
        assert!(!shape.above);
        assert_eq!(shape.toplevel.as_deref(), Some(directory.to_string_lossy().as_ref()));
        let _ = fs::remove_dir_all(&directory);
    }

    #[test]
    fn a_folder_inside_a_repository_is_said_to_be_above_one() {
        let outer = std::env::temp_dir().join("yi-versioning-outer");
        let inner = outer.join("notes");
        let _ = fs::remove_dir_all(&outer);
        fs::create_dir_all(&inner).unwrap();
        fs::create_dir_all(outer.join(".git")).unwrap();

        let shape = repository_shape(&inner);
        assert!(!shape.here);
        assert!(shape.above);
        assert_eq!(shape.toplevel.as_deref(), Some(outer.to_string_lossy().as_ref()));
        let _ = fs::remove_dir_all(&outer);
    }

    #[test]
    fn a_folder_with_no_repository_anywhere_above_it_says_so() {
        let plain = std::env::temp_dir().join("yi-versioning-plain");
        let _ = fs::remove_dir_all(&plain);
        fs::create_dir_all(&plain).unwrap();

        let shape = repository_shape(&plain);
        assert!(!shape.here);
        assert!(!shape.above || std::env::temp_dir().join(".git").exists());
        let _ = fs::remove_dir_all(&plain);
    }

    #[test]
    fn the_cloud_shapes_are_read_from_the_path() {
        let home = PathBuf::from("/Users/someone");
        let drive = home.join("Library/CloudStorage/GoogleDrive-a/My Drive/notes");
        assert_eq!(cloud_kind(&drive, &home, &[]).0, "cloud-storage");

        let icloud = home.join("Library/Mobile Documents/com~apple~CloudDocs/notes");
        assert_eq!(cloud_kind(&icloud, &home, &[]).0, "icloud");

        #[cfg(windows)]
        {
            let onedrive = vec![("OneDrive".to_string(), "C:\\Users\\someone\\OneDrive".to_string())];
            assert_eq!(
                cloud_kind(Path::new("C:\\Users\\someone\\OneDrive\\notes"), &home, &onedrive).0,
                "onedrive"
            );
        }
    }

    #[test]
    fn an_ordinary_folder_is_no_cloud_folder() {
        let plain = std::env::temp_dir().join("yi-versioning-cloud-plain");
        let _ = fs::remove_dir_all(&plain);
        fs::create_dir_all(&plain).unwrap();

        let (kind, evidence) = cloud_kind(&plain, Path::new("/Users/someone"), &[]);
        assert_eq!(kind, "none", "{evidence}");
        let _ = fs::remove_dir_all(&plain);
    }
}
