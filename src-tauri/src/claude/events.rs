use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrontendEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub message: Option<String>,
    pub data: Option<Value>,
    pub timestamp: u64,
    pub session_id: Option<String>,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Parse a single JSONL line from `claude --print --output-format stream-json --verbose`.
///
/// Strategy to avoid duplicates:
///   - `assistant` events  → only emit tool_use items (text is streamed multiple times)
///   - `result` event      → emit the final response text as `assistant_message`
///   - `system` init       → emit as `session_init`
pub fn parse_line(line: &str) -> Option<FrontendEvent> {
    let v: Value = serde_json::from_str(line).ok()?;
    let event_type = v.get("type")?.as_str()?;
    let ts = now_ms();

    match event_type {
        // ── Session init ──────────────────────────────────────────────────────
        "system" => {
            let subtype = v.get("subtype").and_then(|s| s.as_str()).unwrap_or("");
            if subtype != "init" {
                return None;
            }
            Some(FrontendEvent {
                event_type: "session_init".into(),
                message: Some("Session initialized".into()),
                data: Some(v.clone()),
                timestamp: ts,
                session_id: extract_session_id(&v),
            })
        }

        // ── Assistant turn: only surface tool_use items ───────────────────────
        // Text content is emitted repeatedly as streaming chunks + a final copy.
        // We get the clean final text from the `result` event instead.
        "assistant" => {
            let msg = v.get("message")?;
            let content = msg.get("content")?.as_array()?;

            let mut tools: Vec<Value> = Vec::new();

            for item in content {
                if item.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                    tools.push(item.clone());
                }
            }

            if tools.is_empty() {
                return None; // skip text-only assistant events
            }

            let name = tools[0]
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("unknown")
                .to_string();
            let input = tools[0].get("input").cloned();

            Some(FrontendEvent {
                event_type: "tool_use".into(),
                message: Some(name),
                data: input,
                timestamp: ts,
                session_id: extract_session_id(&v),
            })
        }

        // ── Result: the single authoritative final response ───────────────────
        "result" => {
            let is_error = v.get("is_error").and_then(|e| e.as_bool()).unwrap_or(false);
            let text = v.get("result").and_then(|r| r.as_str()).map(str::to_string);
            let session_id = extract_session_id(&v);

            if is_error {
                return Some(FrontendEvent {
                    event_type: "error".into(),
                    message: text,
                    data: None,
                    timestamp: ts,
                    session_id,
                });
            }

            // Emit as assistant_message so it shows with the Claude style,
            // then follow with a no-text result marker so the UI knows it's done.
            // We emit TWO events here — the response text, then the done marker.
            // Caller handles both via the Vec trick; for simplicity return the
            // text event (the done marker is implicit from isProcessing=false).
            Some(FrontendEvent {
                event_type: "assistant_message".into(),
                message: text,
                data: None,
                timestamp: ts,
                session_id,
            })
        }

        _ => None,
    }
}

fn extract_session_id(v: &Value) -> Option<String> {
    v.get("session_id")
        .and_then(|s| s.as_str())
        .map(str::to_string)
}
