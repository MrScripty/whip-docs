use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::config::{AppConfigDto, ConfigStore, SourceRepoStatusDto};
use crate::source::ValidatedRepoPath;

pub struct AppState {
    shutdown_requested: AtomicBool,
    config_store: ConfigStore,
    config: RwLock<AppConfigDto>,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("AppState")
            .field("shutdown_requested", &self.shutdown_requested())
            .field("config_path", &self.config_store.config_path())
            .finish_non_exhaustive()
    }
}

impl AppState {
    pub fn new(config_store: ConfigStore, config: AppConfigDto) -> Self {
        Self {
            shutdown_requested: AtomicBool::new(false),
            config_store,
            config: RwLock::new(config),
        }
    }

    pub fn request_shutdown(&self) {
        self.shutdown_requested.store(true, Ordering::SeqCst);
    }

    fn shutdown_requested(&self) -> bool {
        self.shutdown_requested.load(Ordering::SeqCst)
    }

    pub async fn app_config(&self) -> AppConfigDto {
        self.config.read().await.clone()
    }

    pub async fn set_source_repo_path(
        &self,
        raw_path: String,
    ) -> Result<AppConfigDto, CommandErrorDto> {
        let validated_path = ValidatedRepoPath::parse_existing_cargo_repo(&raw_path)
            .map_err(|error| CommandErrorDto::validation(error.to_string()))?;
        let next_config = AppConfigDto {
            schema_version: crate::config::APP_CONFIG_SCHEMA_VERSION,
            source_repo_path: Some(validated_path.display_path()),
            source_repo_status: SourceRepoStatusDto::Valid,
        };

        self.config_store
            .save(&next_config)
            .await
            .map_err(|error| CommandErrorDto::internal(error.to_string()))?;

        let mut guard = self.config.write().await;
        *guard = next_config.clone();
        Ok(next_config)
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

#[tauri::command]
pub async fn get_app_config(
    state: tauri::State<'_, std::sync::Arc<AppState>>,
) -> Result<AppConfigDto, CommandErrorDto> {
    Ok(state.app_config().await)
}

#[tauri::command]
pub async fn set_source_repo_path(
    path: String,
    state: tauri::State<'_, std::sync::Arc<AppState>>,
) -> Result<AppConfigDto, CommandErrorDto> {
    state.set_source_repo_path(path).await
}

#[cfg(test)]
mod tests {
    use super::{AppState, CommandErrorDto};
    use crate::config::{AppConfigDto, ConfigStore, SourceRepoStatusDto};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "whip-docs-command-{name}-{}-{timestamp}",
            std::process::id()
        ))
    }

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

    #[tokio::test]
    async fn app_state_sets_valid_source_repo_path_and_persists_config() {
        let app_dir = unique_temp_dir("app");
        let repo_dir = unique_temp_dir("repo");
        fs::create_dir_all(&repo_dir).expect("create repo dir");
        fs::write(
            repo_dir.join("Cargo.toml"),
            "[package]\nname = \"fixture\"\n",
        )
        .expect("write manifest");
        let store = ConfigStore::new(&app_dir);
        let state = AppState::new(store.clone(), AppConfigDto::default());

        let config = state
            .set_source_repo_path(repo_dir.to_string_lossy().into_owned())
            .await
            .expect("set source repo path");

        assert_eq!(config.source_repo_status, SourceRepoStatusDto::Valid);
        assert_eq!(state.app_config().await, config);
        assert_eq!(
            store.load_or_default().await.expect("load persisted"),
            config
        );

        fs::remove_dir_all(app_dir).expect("cleanup app dir");
        fs::remove_dir_all(repo_dir).expect("cleanup repo dir");
    }

    #[tokio::test]
    async fn app_state_rejects_invalid_source_repo_path() {
        let app_dir = unique_temp_dir("invalid-app");
        let store = ConfigStore::new(&app_dir);
        let state = AppState::new(store, AppConfigDto::default());

        let error = state
            .set_source_repo_path("../outside".to_string())
            .await
            .expect_err("reject invalid repo path");

        assert_eq!(error.code, "validation_error");
        assert!(error.recoverable);
    }
}
