use serde_json::Value;
use crate::shared::{FrontendEvent, now_ms};

/// Parse a single JSONL line from `codex exec --json`.
///
/// Codex event types:
///   - `thread.started`  → `session_init` (thread_id becomes session_id)
///   - `item.started`    → `tool_use` for command_execution / file_change items
///   - `item.completed`  → `tool_result` for commands/files, `assistant_message` for agent_message
///   - `turn.completed`  → `assistant_message` with token usage
///   - `turn.failed`     → `error`
///   - `error`           → `error`
///
/// Unknown event types are silently skipped.
pub fn parse_codex_line(line: &str) -> Option<FrontendEvent> {
    let v: Value = serde_json::from_str(line).ok()?;
    let event_type = v.get("type")?.as_str()?;
    let ts = now_ms();

    match event_type {
        // ── Thread init ───────────────────────────────────────────────────────
        "thread.started" => {
            let thread_id = v.get("thread_id")
                .and_then(|t| t.as_str())
                .map(str::to_string);
            Some(FrontendEvent {
                event_type: "session_init".into(),
                message: Some("Session initialized".into()),
                data: Some(v.clone()),
                timestamp: ts,
                session_id: thread_id,
                input_tokens: None,
                output_tokens: None,
            })
        }

        // ── Item started: emit tool_use for actionable items ──────────────────
        "item.started" => {
            let item = v.get("item")?;
            let item_type = item.get("type").and_then(|t| t.as_str())?;

            match item_type {
                "command_execution" => {
                    let cmd = item.get("command")
                        .and_then(|c| c.as_str())
                        .unwrap_or("unknown");
                    // Map to a Bash-like tool_use so the frontend treats it
                    // the same as Claude's Bash tool calls.
                    Some(FrontendEvent {
                        event_type: "tool_use".into(),
                        message: Some("Bash".into()),
                        data: Some(serde_json::json!({ "command": cmd })),
                        timestamp: ts,
                        session_id: None,
                        input_tokens: None,
                        output_tokens: None,
                    })
                }
                "file_change" => {
                    let file_path = item.get("file_path")
                        .or_else(|| item.get("filename"))
                        .and_then(|f| f.as_str())
                        .unwrap_or("unknown");
                    // Map to an Edit-like tool_use.
                    Some(FrontendEvent {
                        event_type: "tool_use".into(),
                        message: Some("Edit".into()),
                        data: Some(serde_json::json!({ "file_path": file_path })),
                        timestamp: ts,
                        session_id: None,
                        input_tokens: None,
                        output_tokens: None,
                    })
                }
                "file_read" => {
                    let file_path = item.get("file_path")
                        .or_else(|| item.get("filename"))
                        .and_then(|f| f.as_str())
                        .unwrap_or("unknown");
                    Some(FrontendEvent {
                        event_type: "tool_use".into(),
                        message: Some("Read".into()),
                        data: Some(serde_json::json!({ "file_path": file_path })),
                        timestamp: ts,
                        session_id: None,
                        input_tokens: None,
                        output_tokens: None,
                    })
                }
                _ => None, // skip reasoning, plan_update, web_search, etc. at start
            }
        }

        // ── Item completed: surface agent messages as assistant_message ────────
        "item.completed" => {
            let item = v.get("item")?;
            let item_type = item.get("type").and_then(|t| t.as_str())?;

            match item_type {
                "agent_message" => {
                    let text = item.get("text")
                        .and_then(|t| t.as_str())
                        .map(str::to_string);
                    Some(FrontendEvent {
                        event_type: "assistant_message".into(),
                        message: text,
                        data: None,
                        timestamp: ts,
                        session_id: None,
                        input_tokens: None,
                        output_tokens: None,
                    })
                }
                "command_execution" => {
                    let status = item.get("status")
                        .and_then(|s| s.as_str())
                        .unwrap_or("completed");
                    let exit_code = item.get("exit_code")
                        .and_then(|e| e.as_i64());
                    if status == "failed" || exit_code.map_or(false, |c| c != 0) {
                        Some(FrontendEvent {
                            event_type: "error".into(),
                            message: Some(format!(
                                "Command failed (exit {})",
                                exit_code.unwrap_or(-1)
                            )),
                            data: Some(item.clone()),
                            timestamp: ts,
                            session_id: None,
                            input_tokens: None,
                            output_tokens: None,
                        })
                    } else {
                        // Successful command completion — emit as tool_result
                        Some(FrontendEvent {
                            event_type: "tool_result".into(),
                            message: Some("Bash".into()),
                            data: Some(item.clone()),
                            timestamp: ts,
                            session_id: None,
                            input_tokens: None,
                            output_tokens: None,
                        })
                    }
                }
                _ => None,
            }
        }

        // ── Turn completed: carries token usage ───────────────────────────────
        "turn.completed" => {
            let usage = v.get("usage");
            let input_tokens = usage
                .and_then(|u| u.get("input_tokens"))
                .and_then(|t| t.as_u64());
            let output_tokens = usage
                .and_then(|u| u.get("output_tokens"))
                .and_then(|t| t.as_u64());

            Some(FrontendEvent {
                event_type: "assistant_message".into(),
                message: None, // text already emitted via item.completed agent_message
                data: None,
                timestamp: ts,
                session_id: None,
                input_tokens,
                output_tokens,
            })
        }

        // ── Errors ────────────────────────────────────────────────────────────
        "turn.failed" | "error" => {
            let msg = v.get("message")
                .or_else(|| v.get("error"))
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error")
                .to_string();
            Some(FrontendEvent {
                event_type: "error".into(),
                message: Some(msg),
                data: None,
                timestamp: ts,
                session_id: None,
                input_tokens: None,
                output_tokens: None,
            })
        }

        _ => None, // silently skip unknown event types
    }
}
