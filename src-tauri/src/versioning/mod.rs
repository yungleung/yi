//! What is true of the machine and a folder, for the versioning decision.
//!
//! The decision itself is pure and lives in the frontend; this side answers the facts the webview
//! cannot see — which git may run, whether a folder is in a repository, whether a cloud drive could
//! reach it — and reads versions when the reader asks.
//!
//! May import: the child modules and their public surface. Upholds: the command paths in `lib.rs`
//! stay `versioning::…`, and every git call goes through `git::run_git`.

mod facts;
mod git;
mod versions;

#[allow(unused_imports)]
pub use facts::{RepositoryShape, VersioningFacts};
#[allow(unused_imports)]
pub use git::{find_git, Identity};
#[allow(unused_imports)]
pub use versions::Version;

#[tauri::command]
pub fn versioning_facts(
    app: tauri::AppHandle,
    workspace: String,
) -> Result<VersioningFacts, String> {
    facts::versioning_facts(app, workspace)
}

#[tauri::command]
pub fn versioning_use_git(git: Option<String>) -> Result<(), String> {
    git::versioning_use_git(git)
}

#[tauri::command]
pub fn init_workspace_repository(
    app: tauri::AppHandle,
    workspace: String,
    separate: bool,
) -> Result<String, String> {
    git::init_workspace_repository(app, workspace, separate)
}

#[tauri::command]
pub fn commit_paths(
    workspace: String,
    paths: Vec<String>,
    message: String,
    body: Option<String>,
    identity: Option<Identity>,
) -> Result<(), String> {
    git::commit_paths(workspace, paths, message, body, identity)
}

#[tauri::command]
pub fn versioning_version_text(
    workspace: String,
    revision: String,
    path: String,
) -> Result<String, String> {
    versions::versioning_version_text(workspace, revision, path)
}

#[tauri::command]
pub fn versioning_history(
    workspace: String,
    path: String,
    limit: usize,
) -> Result<Vec<Version>, String> {
    versions::versioning_history(workspace, path, limit)
}

#[cfg(test)]
mod tests;
