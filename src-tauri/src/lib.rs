mod claude;

use claude::AppState;

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

const SKIP_DIRS: &[&str] = &[
    "node_modules", "target", ".next", "dist", "build",
    "__pycache__", ".cache", "vendor", ".turbo", ".venv", "venv",
];

const MAX_FILES: usize = 600;

fn scan_recursive(
    dir: &std::path::Path,
    depth: usize,
    max_depth: usize,
    results: &mut Vec<String>,
) -> Result<(), String> {
    if depth > max_depth || results.len() >= MAX_FILES {
        return Ok(());
    }
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    let mut sorted: Vec<_> = entries.flatten().collect();
    sorted.sort_by_key(|e| e.file_name());
    for entry in sorted {
        if results.len() >= MAX_FILES {
            break;
        }
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            if SKIP_DIRS.contains(&name) {
                continue;
            }
            scan_recursive(&path, depth + 1, max_depth, results)?;
        } else {
            results.push(path.to_string_lossy().to_string());
        }
    }
    Ok(())
}

#[tauri::command]
fn scan_directory(path: String) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    scan_recursive(&std::path::PathBuf::from(&path), 0, 8, &mut results)?;
    Ok(results)
}

#[tauri::command]
fn read_file_full(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            claude::process::send_prompt,
            claude::process::stop_session,
            read_file_preview,
            scan_directory,
            get_home_dir,
            read_file_full,
            write_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
