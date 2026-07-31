use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
pub struct FileInfo {
    pub path: String,
    pub basename: String,
    pub is_file: bool,
}

#[tauri::command]
pub fn list_folder_files(folder_path: String) -> Result<Vec<FileInfo>, String> {
    let folder = PathBuf::from(folder_path);

    if !folder.exists() {
        return Err(format!("Folder does not exist: {}", folder.display()));
    }

    if !folder.is_dir() {
        return Err(format!("Path is not a directory: {}", folder.display()));
    }

    let mut entries = fs::read_dir(&folder)
        .map_err(|err| format!("Failed to read folder {}: {err}", folder.display()))?
        .filter_map(|entry| {
            entry.ok().and_then(|entry| {
                let path = entry.path();
                let basename = entry.file_name().to_string_lossy().into_owned();

                if basename.starts_with('.') {
                    return None;
                }

                if path.is_dir() {
                    return Some(FileInfo {
                        path: path.to_string_lossy().into_owned(),
                        basename,
                        is_file: false,
                    });
                }

                let is_markdown = path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "markdown" | "mdx"));

                if is_markdown {
                    Some(FileInfo {
                        path: path.to_string_lossy().into_owned(),
                        basename,
                        is_file: true,
                    })
                } else {
                    None
                }
            })
        })
        .collect::<Vec<_>>();

    entries.sort_by(|left, right| left.basename.cmp(&right.basename));

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_temp_dir() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("yi-files-test-{unique}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_markdown_files_and_directories() {
        let dir = create_temp_dir();
        let nested = dir.join("nested");
        fs::create_dir(&nested).unwrap();
        fs::write(dir.join("note.txt"), "hi").unwrap();
        fs::write(dir.join("readme.md"), "# hi").unwrap();

        let result = list_folder_files(dir.to_string_lossy().to_string()).unwrap();
        let names: Vec<_> = result
            .iter()
            .map(|entry| (&entry.basename, entry.is_file))
            .collect();

        assert!(names.contains(&(&"readme.md".to_string(), true)));
        assert!(names.contains(&(&"nested".to_string(), false)));
        assert!(!names.contains(&(&"note.txt".to_string(), true)));
    }
}
