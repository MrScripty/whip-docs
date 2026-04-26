//! Validated source repository paths and snippet services.

use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedRepoPath {
    canonical_path: PathBuf,
}

impl ValidatedRepoPath {
    pub fn parse_existing_cargo_repo(raw_path: impl AsRef<Path>) -> Result<Self, SourcePathError> {
        let raw_path = raw_path.as_ref();
        if raw_path.as_os_str().is_empty() {
            return Err(SourcePathError::Empty);
        }

        if raw_path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
        {
            return Err(SourcePathError::Traversal);
        }

        let canonical_path =
            raw_path
                .canonicalize()
                .map_err(|error| SourcePathError::Canonicalize {
                    path: raw_path.to_path_buf(),
                    message: error.to_string(),
                })?;

        if !canonical_path.is_dir() {
            return Err(SourcePathError::NotDirectory(canonical_path));
        }

        let manifest_path = canonical_path.join("Cargo.toml");
        if !manifest_path.is_file() {
            return Err(SourcePathError::MissingCargoManifest(canonical_path));
        }

        Ok(Self { canonical_path })
    }

    pub fn as_path(&self) -> &Path {
        &self.canonical_path
    }

    pub fn display_path(&self) -> String {
        self.canonical_path.to_string_lossy().into_owned()
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum SourcePathError {
    #[error("source repository path is empty")]
    Empty,
    #[error("source repository path cannot contain parent traversal")]
    Traversal,
    #[error("failed to canonicalize source repository path '{path}': {message}")]
    Canonicalize { path: PathBuf, message: String },
    #[error("source repository path is not a directory: {0}")]
    NotDirectory(PathBuf),
    #[error("source repository path does not contain Cargo.toml: {0}")]
    MissingCargoManifest(PathBuf),
}

#[cfg(test)]
mod tests {
    use super::{SourcePathError, ValidatedRepoPath};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "whip-docs-{name}-{}-{timestamp}",
            std::process::id()
        ))
    }

    #[test]
    fn valid_repo_path_canonicalizes_existing_cargo_repo() {
        let repo = unique_temp_dir("valid-repo");
        fs::create_dir_all(&repo).expect("create temp repo");
        fs::write(repo.join("Cargo.toml"), "[package]\nname = \"fixture\"\n")
            .expect("write manifest");

        let validated =
            ValidatedRepoPath::parse_existing_cargo_repo(&repo).expect("valid repo path");

        assert!(validated.as_path().is_absolute());
        assert_eq!(validated.as_path().file_name(), repo.file_name());
        assert!(validated.display_path().contains("whip-docs-valid-repo"));

        fs::remove_dir_all(repo).expect("cleanup temp repo");
    }

    #[test]
    fn repo_path_rejects_parent_traversal() {
        let error = ValidatedRepoPath::parse_existing_cargo_repo("../outside")
            .expect_err("must reject traversal");

        assert_eq!(error, SourcePathError::Traversal);
    }

    #[test]
    fn repo_path_rejects_directory_without_manifest() {
        let repo = unique_temp_dir("missing-manifest");
        fs::create_dir_all(&repo).expect("create temp repo");

        let error = ValidatedRepoPath::parse_existing_cargo_repo(&repo)
            .expect_err("must reject missing manifest");

        assert!(matches!(error, SourcePathError::MissingCargoManifest(_)));

        fs::remove_dir_all(repo).expect("cleanup temp repo");
    }
}
