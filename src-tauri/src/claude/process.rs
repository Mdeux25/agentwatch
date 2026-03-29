use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use super::events::{now_ms, parse_line, FrontendEvent};

#[derive(Default)]
pub struct AppState {
    pub session_id: Mutex<Option<String>>,
}

fn find_claude() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{home}/.local/bin/claude"),
        "/usr/local/bin/claude".to_string(),
        "/opt/homebrew/bin/claude".to_string(),
        "/usr/bin/claude".to_string(),
    ];
    for path in &candidates {
        let pb = std::path::PathBuf::from(path);
        if pb.exists() {
            return Ok(pb);
        }
    }
    Err("claude CLI not found. Install Claude Code from https://claude.ai/code".to_string())
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
pub async fn send_prompt(
    prompt: String,
    session_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let claude = find_claude()?;
    let home = std::env::var("HOME").unwrap_or_default();

    let resume_id = {
        let lock = state.session_id.lock().unwrap();
        session_id.or_else(|| lock.clone())
    };

    let mut cmd = Command::new(&claude);
    cmd.arg("--print")
        .arg(&prompt)
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .arg("--dangerously-skip-permissions")
        // Pass full inherited environment plus ensure HOME/PATH are correct
        .env("HOME", &home)
        .env(
            "PATH",
            format!("{home}/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"),
        )
        // Claude Code stores auth in ~/.claude — needs XDG / config paths
        .env("XDG_CONFIG_HOME", format!("{home}/.config"))
        .env("XDG_DATA_HOME", format!("{home}/.local/share"))
        // Required for some terminal detection inside claude
        .env("TERM", "xterm-256color")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(ref sid) = resume_id {
        cmd.arg("--resume").arg(sid);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn claude: {e}"))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;

    // Read stderr in background and surface it as error events
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

        if let Some(event) = parse_line(&line) {
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
        emit_error(&app, format!("claude exited with code {code}"));
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_session(state: State<'_, AppState>) -> Result<(), String> {
    *state.session_id.lock().unwrap() = None;
    Ok(())
}
