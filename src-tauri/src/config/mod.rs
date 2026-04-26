//! Backend-owned application configuration contracts and persistence.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const APP_CONFIG_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfigDto {
    pub schema_version: u32,
    pub source_repo_path: Option<String>,
    pub source_repo_status: SourceRepoStatusDto,
}

impl Default for AppConfigDto {
    fn default() -> Self {
        Self {
            schema_version: APP_CONFIG_SCHEMA_VERSION,
            source_repo_path: None,
            source_repo_status: SourceRepoStatusDto::Unconfigured,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceRepoStatusDto {
    Unconfigured,
    Valid,
    Missing,
    NotDirectory,
    MissingCargoManifest,
    InvalidPath,
}

#[derive(Debug, Clone)]
pub struct ConfigStore {
    config_path: PathBuf,
}

impl ConfigStore {
    pub fn new(app_data_dir: impl Into<PathBuf>) -> Self {
        Self {
            config_path: app_data_dir.into().join("config.json"),
        }
    }

    pub fn config_path(&self) -> &Path {
        &self.config_path
    }

    pub async fn load_or_default(&self) -> Result<AppConfigDto, ConfigStoreError> {
        if !self.config_path.exists() {
            return Ok(AppConfigDto::default());
        }

        let contents = tokio::fs::read_to_string(&self.config_path)
            .await
            .map_err(ConfigStoreError::Io)?;
        let config: AppConfigDto =
            serde_json::from_str(&contents).map_err(ConfigStoreError::Parse)?;

        if config.schema_version != APP_CONFIG_SCHEMA_VERSION {
            return Err(ConfigStoreError::UnsupportedSchemaVersion {
                found: config.schema_version,
                supported: APP_CONFIG_SCHEMA_VERSION,
            });
        }

        Ok(config)
    }

    pub async fn save(&self, config: &AppConfigDto) -> Result<(), ConfigStoreError> {
        if let Some(parent) = self.config_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(ConfigStoreError::Io)?;
        }

        let contents = serde_json::to_string_pretty(config).map_err(ConfigStoreError::Serialize)?;
        tokio::fs::write(&self.config_path, contents)
            .await
            .map_err(ConfigStoreError::Io)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigStoreError {
    #[error("failed to read or write app config: {0}")]
    Io(#[from] std::io::Error),
    #[error("failed to parse app config: {0}")]
    Parse(serde_json::Error),
    #[error("failed to serialize app config: {0}")]
    Serialize(serde_json::Error),
    #[error("unsupported app config schema version {found}; supported version is {supported}")]
    UnsupportedSchemaVersion { found: u32, supported: u32 },
}

#[cfg(test)]
mod tests {
    use super::{AppConfigDto, ConfigStore, SourceRepoStatusDto, APP_CONFIG_SCHEMA_VERSION};
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "whip-docs-config-{name}-{}-{timestamp}",
            std::process::id()
        ))
    }

    #[test]
    fn default_config_has_schema_version_and_unconfigured_status() {
        let config = AppConfigDto::default();

        assert_eq!(config.schema_version, APP_CONFIG_SCHEMA_VERSION);
        assert_eq!(config.source_repo_path, None);
        assert_eq!(config.source_repo_status, SourceRepoStatusDto::Unconfigured);
    }

    #[test]
    fn config_dto_serializes_stable_wire_shape() {
        let config = AppConfigDto {
            schema_version: APP_CONFIG_SCHEMA_VERSION,
            source_repo_path: Some("/repo".to_string()),
            source_repo_status: SourceRepoStatusDto::Valid,
        };

        let serialized = serde_json::to_string(&config).expect("serialize config dto");

        assert_eq!(
            serialized,
            r#"{"schemaVersion":1,"sourceRepoPath":"/repo","sourceRepoStatus":"valid"}"#
        );
    }

    #[tokio::test]
    async fn config_store_loads_default_when_file_is_missing() {
        let temp_dir = unique_temp_dir("missing");
        let store = ConfigStore::new(&temp_dir);

        let config = store.load_or_default().await.expect("load default config");

        assert_eq!(config, AppConfigDto::default());
    }

    #[tokio::test]
    async fn config_store_saves_and_loads_config() {
        let temp_dir = unique_temp_dir("roundtrip");
        let store = ConfigStore::new(&temp_dir);
        let config = AppConfigDto {
            schema_version: APP_CONFIG_SCHEMA_VERSION,
            source_repo_path: Some("/repo".to_string()),
            source_repo_status: SourceRepoStatusDto::Valid,
        };

        store.save(&config).await.expect("save config");
        let loaded = store.load_or_default().await.expect("load config");

        assert_eq!(loaded, config);

        tokio::fs::remove_dir_all(temp_dir)
            .await
            .expect("cleanup config temp dir");
    }
}
