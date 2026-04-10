use std::process::Stdio;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use super::events::parse_codex_line;
use crate::shared::{now_ms, FrontendEvent};
use crate::state::AppState;

fn find_codex() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{home}/.npm-global/bin/codex"),
        format!("{home}/.local/bin/codex"),
        "/usr/local/bin/codex".to_string(),
        "/opt/homebrew/bin/codex".to_string(),
        "/usr/bin/codex".to_string(),
    ];
    for path in &candidates {
        let pb = std::path::PathBuf::from(path);
        if pb.exists() {
            return Ok(pb);
        }
    }
    // Fallback: try `which codex`
    if let Ok(output) = std::process::Command::new("which").arg("codex").output() {
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !p.is_empty() {
                return Ok(std::path::PathBuf::from(p));
            }
        }
    }
    Err("codex CLI not found. Install with: npm install -g @openai/codex".to_string())
}

fn emit_error(app: &AppHandle, msg: String) {
    let _ = app.emit(
        "claude-event",
        &FrontendEvent {
            event_type: "error".into(),
            message: Some(msg),
            data: None,
            timestamp: now_ms(),
            session_id: None,
            input_tokens: None,
            output_tokens: None,
        },
    );
}

#[tauri::command]
pub async fn send_codex_prompt(
    prompt: String,
    _session_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let codex = find_codex()?;
    let home = std::env::var("HOME").unwrap_or_default();

    let mut cmd = Command::new(&codex);
    cmd.arg("exec")
        .arg(&prompt)
        .arg("--json")
        .arg("--full-auto")
        .env("HOME", &home)
        .env(
            "PATH",
            format!("{home}/.npm-global/bin:{home}/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"),
        )
        .env("TERM", "xterm-256color")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn codex: {e}"))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;

    // Read stderr in background
    let app_err = app.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        let mut buf = Vec::new();
        while let Ok(Some(line)) = lines.next_line().await {
            let line = line.trim().to_string();
            if !line.is_empty() {
                buf.push(line);
            }
        }
        if !buf.is_empty() {
            emit_error(&app_err, format!("stderr: {}", buf.join(" | ")));
        }
    });

    // Read stdout (JSONL events)
    let mut lines = BufReader::new(stdout).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        if let Some(event) = parse_codex_line(&line) {
            if event.event_type == "session_init" {
                if let Some(ref sid) = event.session_id {
                    *state.session_id.lock().unwrap() = Some(sid.clone());
                }
            }
            app.emit("claude-event", &event)
                .map_err(|e| format!("Emit error: {e}"))?;
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;

    if !status.success() {
        let code = status.code().unwrap_or(-1);
        emit_error(&app, format!("codex exited with code {code}"));
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_codex_session(state: State<'_, AppState>) -> Result<(), String> {
    *state.session_id.lock().unwrap() = None;
    Ok(())
}
