use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};

#[derive(Debug, Default)]
pub struct AppState {
    shutdown_requested: AtomicBool,
}

impl AppState {
    pub fn request_shutdown(&self) {
        self.shutdown_requested.store(true, Ordering::SeqCst);
    }

    fn shutdown_requested(&self) -> bool {
        self.shutdown_requested.load(Ordering::SeqCst)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatusDto {
    pub app_name: &'static str,
    pub active_product: &'static str,
    pub shutdown_requested: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandErrorDto {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

impl CommandErrorDto {
    pub fn validation(message: impl Into<String>) -> Self {
        Self {
            code: "validation_error".to_string(),
            message: message.into(),
            recoverable: true,
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            code: "internal_error".to_string(),
            message: message.into(),
            recoverable: false,
        }
    }
}

#[tauri::command]
pub fn get_app_status(state: tauri::State<'_, std::sync::Arc<AppState>>) -> AppStatusDto {
    AppStatusDto {
        app_name: "Whip Docs",
        active_product: "local_architecture_analyzer",
        shutdown_requested: state.shutdown_requested(),
    }
}

#[cfg(test)]
mod tests {
    use super::CommandErrorDto;

    #[test]
    fn command_error_serializes_camel_case_contract() {
        let error = CommandErrorDto::validation("source repo path is invalid");
        let serialized = serde_json::to_string(&error).expect("serialize command error");

        assert_eq!(
            serialized,
            r#"{"code":"validation_error","message":"source repo path is invalid","recoverable":true}"#
        );
    }

    #[test]
    fn internal_command_error_is_not_recoverable() {
        let error = CommandErrorDto::internal("analysis task failed");

        assert_eq!(error.code, "internal_error");
        assert!(!error.recoverable);
    }
}
