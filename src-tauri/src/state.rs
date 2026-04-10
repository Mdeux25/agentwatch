use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    pub session_id: Mutex<Option<String>>,
    pub provider: Mutex<String>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            session_id: Mutex::new(None),
            provider: Mutex::new("claude".to_string()),
        }
    }
}
