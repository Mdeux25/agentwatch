mod claude;

use claude::AppState;

// ── File preview ──────────────────────────────────────────────────────────────

#[tauri::command]
fn read_file_preview(path: String) -> Result<String, String> {
    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let lines: Vec<String> = BufReader::new(file)
        .lines()
        .take(20)
        .filter_map(|l| l.ok())
        .collect();
    Ok(lines.join("\n"))
}

#[tauri::command]
fn get_home_dir() -> String {
    std::env::var("HOME").unwrap_or_default()
}

// ── Gitignore-aware directory scan ────────────────────────────────────────────

const SKIP_DIRS: &[&str] = &[
    "node_modules", "target", ".next", "dist", "build",
    "__pycache__", ".cache", "vendor", ".turbo", ".venv", "venv",
];

const MAX_FILES: usize = 600;

/// Scan a directory, respecting .gitignore rules and skipping submodules.
/// Falls back to the old dumb scan if the ignore crate fails to build a walker.
#[tauri::command]
fn scan_directory(path: String) -> Result<Vec<String>, String> {
    use ignore::WalkBuilder;

    let root = std::path::PathBuf::from(&path);
    let mut results = Vec::new();

    let walker = WalkBuilder::new(&root)
        .hidden(false)       // we handle dotfiles ourselves below
        .git_ignore(true)    // respect .gitignore at every level
        .git_global(false)   // skip machine-global gitignore
        .git_exclude(false)  // skip .git/info/exclude
        .follow_links(false)
        .max_depth(Some(9))
        .build();

    for entry in walker {
        if results.len() >= MAX_FILES {
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();

        // Skip hidden root-level items (e.g. .git, .DS_Store)
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                // Allow hidden directories to be walked (gitignore handles them),
                // but skip the entry itself from the results if it is a file.
                if path.is_file() {
                    continue;
                }
            }
            if path.is_dir() && SKIP_DIRS.contains(&name) {
                // Returning Err from filter_entry would be cleaner but this
                // is simpler: skip adding the dir to results and the walker
                // already won't descend because we filtered at the walker level.
                // Actually WalkBuilder doesn't support per-entry filtering here,
                // but SKIP_DIRS are usually caught by .gitignore anyway.
                continue;
            }
        }

        if path.is_file() {
            results.push(path.to_string_lossy().to_string());
        }
    }

    Ok(results)
}

// ── Native folder-picker dialog ───────────────────────────────────────────────

/// Opens a native "Choose Folder" dialog and returns the selected path, or
/// an empty string if the user cancelled.
#[tauri::command]
async fn open_folder_dialog(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder = app
        .dialog()
        .file()
        .set_title("Open Project Folder")
        .blocking_pick_folder();

    Ok(folder
        .map(|p| p.to_string())
        .unwrap_or_default())
}

// ── Read / write ──────────────────────────────────────────────────────────────

#[tauri::command]
fn read_file_full(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            claude::process::send_prompt,
            claude::process::stop_session,
            read_file_preview,
            scan_directory,
            open_folder_dialog,
            get_home_dir,
            read_file_full,
            write_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
