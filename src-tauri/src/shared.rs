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
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
