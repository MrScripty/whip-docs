// src/config.rs
use serde::{Deserialize, Serialize};
use std::fs;
use std::io; // Keep io for Error kinds
use std::path::PathBuf;
use thiserror::Error;

pub const CONFIG_DIR: &str = "user";
const CONFIG_FILE: &str = "tool_config.json";
pub const OUTPUT_DIR: &str = "output";

#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("IO error accessing config/output directory: {0}")]
    Io(#[from] io::Error),
    // Keep Json error separate for clarity, though we handle it internally now
    #[error("JSON serialization error: {0}")]
    JsonSerialize(#[from] serde_json::Error),
    #[error("Configuration directory '{0}' could not be created")]
    DirCreationFailed(String),
    #[error("Project path is not set. Please set it using the 'config set-path' command.")]
    ProjectPathNotSet,
    #[error("Invalid project path provided: {0}")]
    InvalidProjectPath(PathBuf),
}

#[derive(Serialize, Deserialize, Debug, Default, Clone)] // Add Clone
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub project_path: Option<String>,
}

pub fn ensure_dir_exists(dir_path: &str) -> Result<PathBuf, ConfigError> {
    let path = PathBuf::from(dir_path);
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| {
            log::error!("Failed to create directory '{}': {}", path.display(), e);
            ConfigError::DirCreationFailed(dir_path.to_string())
        })?;
        log::info!("Created directory: {}", path.display());
    }
    Ok(path)
}

fn get_config_path() -> Result<PathBuf, ConfigError> {
    let config_dir = ensure_dir_exists(CONFIG_DIR)?;
    Ok(config_dir.join(CONFIG_FILE))
}

// --- Updated load_config ---
pub fn load_config() -> Result<Config, ConfigError> {
    let config_path = get_config_path()?; // Propagate error if we can't even determine the path

    match fs::read_to_string(&config_path) {
        Ok(content) => {
            // File exists and was read successfully
            if content.trim().is_empty() {
                // File is empty or only whitespace
                log::warn!(
                    "Config file '{}' is empty or contains only whitespace. Deleting and using default config.",
                    config_path.display()
                );
                // Attempt to delete the empty file, log error if deletion fails but continue
                if let Err(e) = fs::remove_file(&config_path) {
                    log::error!(
                        "Failed to delete empty config file '{}': {}. Proceeding with default.",
                        config_path.display(),
                        e
                    );
                }
                Ok(Config::default())
            } else {
                // File has content, try to parse it
                match serde_json::from_str::<Config>(&content) {
                    Ok(config) => {
                        log::info!("Successfully loaded config from: {}", config_path.display());
                        Ok(config) // Successfully parsed
                    }
                    Err(e) => {
                        // Parsing failed for non-empty file
                        log::warn!(
                            "Failed to parse config file '{}': {}. Deleting invalid file and using default config.",
                            config_path.display(),
                            e
                        );
                        // Attempt to delete the invalid file, log error if deletion fails but continue
                        if let Err(e_del) = fs::remove_file(&config_path) {
                            log::error!(
                                "Failed to delete invalid config file '{}': {}. Proceeding with default.",
                                config_path.display(),
                                e_del
                            );
                        }
                        Ok(Config::default()) // Return default config
                    }
                }
            }
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            // File does not exist - this is fine, use default
            log::info!(
                "Config file '{}' not found. Using default config.",
                config_path.display()
            );
            Ok(Config::default())
        }
        Err(e) => {
            // Other IO error reading the file (e.g., permissions) - Propagate this
            log::error!(
                "Failed to read config file '{}' due to IO error: {}",
                config_path.display(),
                e
            );
            Err(ConfigError::Io(e))
        }
    }
}
// --- End of updated load_config ---

pub fn save_config(config: &Config) -> Result<(), ConfigError> {
    let config_path = get_config_path()?;
    log::info!("Saving config to: {}", config_path.display());
    // Use JsonSerialize error variant here
    let content = serde_json::to_string_pretty(config).map_err(ConfigError::JsonSerialize)?;
    fs::write(&config_path, content)?; // Propagate IO error on write
    log::info!("Configuration saved successfully.");
    Ok(())
}

pub fn get_validated_project_path(config: &Config) -> Result<PathBuf, ConfigError> {
    let path_str = config
        .project_path
        .as_deref()
        .ok_or(ConfigError::ProjectPathNotSet)?;
    let expanded_path_str = shellexpand::tilde(path_str).to_string();
    let path = PathBuf::from(expanded_path_str);

    if path.is_dir() {
        log::debug!("Validated project path: {}", path.display());
        Ok(path)
    } else {
        log::warn!("Validation failed: Path '{}' is not a valid directory.", path.display());
        Err(ConfigError::InvalidProjectPath(path))
    }
}

pub fn ensure_output_dir_exists() -> Result<PathBuf, ConfigError> {
    ensure_dir_exists(OUTPUT_DIR)
}

pub fn get_output_path() -> Result<PathBuf, ConfigError> {
    ensure_output_dir_exists()
}