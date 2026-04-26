//! Backend-owned application configuration contracts.

use serde::{Deserialize, Serialize};

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

#[cfg(test)]
mod tests {
    use super::{AppConfigDto, SourceRepoStatusDto, APP_CONFIG_SCHEMA_VERSION};

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
}
