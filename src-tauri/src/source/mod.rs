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

    pub fn resolve_existing_child(
        &self,
        relative_path: impl AsRef<Path>,
    ) -> Result<PathBuf, SourcePathError> {
        let relative_path = relative_path.as_ref();
        if relative_path.as_os_str().is_empty() {
            return Err(SourcePathError::Empty);
        }

        if relative_path.is_absolute() {
            return Err(SourcePathError::AbsoluteChildPath(
                relative_path.to_path_buf(),
            ));
        }

        if relative_path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
        {
            return Err(SourcePathError::Traversal);
        }

        let candidate_path = self.canonical_path.join(relative_path);
        let canonical_child =
            candidate_path
                .canonicalize()
                .map_err(|error| SourcePathError::Canonicalize {
                    path: candidate_path,
                    message: error.to_string(),
                })?;

        if !canonical_child.starts_with(&self.canonical_path) {
            return Err(SourcePathError::SymlinkEscape {
                path: relative_path.to_path_buf(),
                resolved_path: canonical_child,
            });
        }

        Ok(canonical_child)
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
    #[error("source child path must be relative to the repository root: {0}")]
    AbsoluteChildPath(PathBuf),
    #[error(
        "source child path escapes the repository through a symlink: {path} -> {resolved_path}"
    )]
    SymlinkEscape {
        path: PathBuf,
        resolved_path: PathBuf,
    },
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

    #[test]
    fn repo_path_rejects_missing_path() {
        let repo = unique_temp_dir("missing-path");

        let error = ValidatedRepoPath::parse_existing_cargo_repo(&repo)
            .expect_err("must reject missing path");

        assert!(matches!(error, SourcePathError::Canonicalize { .. }));
    }

    #[test]
    fn repo_path_rejects_file_path() {
        let repo = unique_temp_dir("file-path");
        fs::create_dir_all(&repo).expect("create temp dir");
        let file_path = repo.join("Cargo.toml");
        fs::write(&file_path, "[package]\nname = \"fixture\"\n").expect("write file");

        let error = ValidatedRepoPath::parse_existing_cargo_repo(&file_path)
            .expect_err("must reject file path");

        assert!(matches!(error, SourcePathError::NotDirectory(_)));

        fs::remove_dir_all(repo).expect("cleanup temp dir");
    }

    #[test]
    fn repo_path_accepts_relative_existing_cargo_repo() {
        let current_dir = std::env::current_dir().expect("current dir");
        let repo = current_dir.join(format!(
            "target/whip-docs-relative-repo-{}",
            std::process::id()
        ));
        fs::create_dir_all(&repo).expect("create temp repo");
        fs::write(repo.join("Cargo.toml"), "[package]\nname = \"fixture\"\n")
            .expect("write manifest");

        let relative_repo = repo.strip_prefix(&current_dir).expect("relative repo path");
        let validated = ValidatedRepoPath::parse_existing_cargo_repo(relative_repo)
            .expect("valid relative repo path");

        assert_eq!(
            validated.as_path(),
            repo.canonicalize().expect("canonical repo")
        );

        fs::remove_dir_all(repo).expect("cleanup temp repo");
    }

    #[test]
    fn child_path_resolves_inside_repo() {
        let repo = unique_temp_dir("child-inside");
        fs::create_dir_all(repo.join("src")).expect("create temp repo src");
        fs::write(repo.join("Cargo.toml"), "[package]\nname = \"fixture\"\n")
            .expect("write manifest");
        fs::write(repo.join("src/lib.rs"), "pub fn fixture() {}\n").expect("write source");
        let validated =
            ValidatedRepoPath::parse_existing_cargo_repo(&repo).expect("valid repo path");

        let child = validated
            .resolve_existing_child("src/lib.rs")
            .expect("child path inside repo");

        assert_eq!(
            child,
            repo.join("src/lib.rs")
                .canonicalize()
                .expect("canonical child")
        );

        fs::remove_dir_all(repo).expect("cleanup temp repo");
    }

    #[test]
    fn child_path_rejects_absolute_path() {
        let repo = unique_temp_dir("child-absolute");
        fs::create_dir_all(&repo).expect("create temp repo");
        fs::write(repo.join("Cargo.toml"), "[package]\nname = \"fixture\"\n")
            .expect("write manifest");
        let validated =
            ValidatedRepoPath::parse_existing_cargo_repo(&repo).expect("valid repo path");

        let error = validated
            .resolve_existing_child(repo.join("Cargo.toml"))
            .expect_err("must reject absolute child path");

        assert!(matches!(error, SourcePathError::AbsoluteChildPath(_)));

        fs::remove_dir_all(repo).expect("cleanup temp repo");
    }

    #[cfg(unix)]
    #[test]
    fn child_path_rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let repo = unique_temp_dir("symlink-repo");
        let outside = unique_temp_dir("symlink-outside");
        fs::create_dir_all(repo.join("src")).expect("create temp repo src");
        fs::create_dir_all(&outside).expect("create outside dir");
        fs::write(repo.join("Cargo.toml"), "[package]\nname = \"fixture\"\n")
            .expect("write manifest");
        fs::write(outside.join("secret.rs"), "pub fn outside() {}\n").expect("write outside file");
        symlink(outside.join("secret.rs"), repo.join("src/escape.rs")).expect("create symlink");
        let validated =
            ValidatedRepoPath::parse_existing_cargo_repo(&repo).expect("valid repo path");

        let error = validated
            .resolve_existing_child("src/escape.rs")
            .expect_err("must reject symlink escape");

        assert!(matches!(error, SourcePathError::SymlinkEscape { .. }));

        fs::remove_dir_all(repo).expect("cleanup temp repo");
        fs::remove_dir_all(outside).expect("cleanup outside dir");
    }
}
