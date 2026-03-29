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

const MAX_FILES: usize = 600;

/// Scan a directory tree.
/// - Always skips hidden entries (names starting with '.', e.g. .git, .DS_Store).
/// - Optionally respects .gitignore rules at every directory level.
#[tauri::command]
fn scan_directory(path: String, use_gitignore: bool) -> Result<Vec<String>, String> {
    use ignore::WalkBuilder;

    let root = std::path::PathBuf::from(&path);
    let mut results = Vec::new();

    let walker = WalkBuilder::new(&root)
        .hidden(true)                  // always skip dot-files and dot-dirs
        .git_ignore(use_gitignore)     // toggled by the frontend
        .git_global(false)
        .git_exclude(false)
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
        if entry.path().is_file() {
            results.push(entry.path().to_string_lossy().to_string());
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
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

// ── Usage tracking ─────────────────────────────────────────────────────────────

#[tauri::command]
fn append_usage_record(record: String) -> Result<(), String> {
    use std::io::Write;
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&home).join(".agentwatch").join("usage.jsonl");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{}", record).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_usage_records() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&home).join(".agentwatch").join("usage.jsonl");
    // Return empty string if file doesn't exist yet
    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

// ── Context meta files ────────────────────────────────────────────────────────

/// Write .agentwatch/context/{rel_path}.html and .ctx.md, ensure .gitignore covers .agentwatch/
#[tauri::command]
fn save_context_files(
    project_root: String,
    file_path: String,
    html: String,
    ctx_md: String,
) -> Result<(), String> {
    // Compute relative path (strip project_root prefix)
    let rel = file_path
        .strip_prefix(&project_root)
        .unwrap_or(&file_path)
        .trim_start_matches('/');

    let context_dir = format!("{}/.agentwatch/context", project_root);
    std::fs::create_dir_all(&context_dir).map_err(|e| e.to_string())?;

    // Preserve directory structure under context_dir
    let html_path = format!("{}/{}.html", context_dir, rel);
    let md_path   = format!("{}/{}.ctx.md", context_dir, rel);

    // Create parent dirs for nested files
    if let Some(parent) = std::path::Path::new(&html_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::write(&html_path, html).map_err(|e| e.to_string())?;
    std::fs::write(&md_path, ctx_md).map_err(|e| e.to_string())?;

    // Ensure .agentwatch/ is in .gitignore
    let gitignore_path = format!("{}/.gitignore", project_root);
    let entry = ".agentwatch/\n";
    match std::fs::read_to_string(&gitignore_path) {
        Ok(existing) => {
            if !existing.contains(".agentwatch/") {
                let mut updated = existing;
                if !updated.ends_with('\n') { updated.push('\n'); }
                updated.push_str(entry);
                std::fs::write(&gitignore_path, updated).map_err(|e| e.to_string())?;
            }
        }
        Err(_) => {
            // No .gitignore yet — create one
            std::fs::write(&gitignore_path, entry).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

// ── Generic claude -p runner ──────────────────────────────────────────────────

#[tauri::command]
async fn run_claude_prompt(prompt: String) -> Result<String, String> {
    let claude = find_claude_bin()?;
    let output = tokio::process::Command::new(&claude)
        .args(["-p", "--dangerously-skip-permissions", &prompt])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        let msg = if stdout.is_empty() { stderr } else if stderr.is_empty() { stdout } else { format!("{stderr}\n{stdout}") };
        Err(msg)
    }
}

// ── File summary via claude -p ────────────────────────────────────────────────

fn find_claude_bin() -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{home}/.local/bin/claude"),
        "/usr/local/bin/claude".to_string(),
        "/opt/homebrew/bin/claude".to_string(),
        "/usr/bin/claude".to_string(),
    ];
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Ok(path.clone());
        }
    }
    Err("claude CLI not found".to_string())
}

#[tauri::command]
async fn generate_file_summary(path: String, content: String) -> Result<String, String> {
    let claude = find_claude_bin()?;
    let truncated = if content.len() > 8000 { &content[..8000] } else { &content };
    let prompt = format!(
        "Summarize this file concisely for a developer. Describe what it does, its key functions/endpoints/components, parameters, return values, and any notable patterns or issues. Be specific and technical. Keep it under 300 words.\n\nFile: {path}\n\n```\n{truncated}\n```"
    );
    let output = tokio::process::Command::new(&claude)
        .args(["-p", &prompt])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
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
            append_usage_record,
            load_usage_records,
            save_context_files,
            generate_file_summary,
            run_claude_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
