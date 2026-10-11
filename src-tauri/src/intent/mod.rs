//! Append-only, local intent records. Raw file bytes are ephemeral and never persisted.
//!
//! IDs identify a selection in one analyzed repository. They are not semantic
//! identities across moves, renames, changed source, or analyzer versions.

use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::analyzer::AnalyzedGraph;
use crate::graph::{GraphEdgeDto, GraphNodeDto, GraphNodeKind, SourceRangeDto};
use crate::source::{read_bounded_source, ValidatedRepoPath, MAX_SOURCE_BYTES};
use crate::syntax::{AnalysisIdentity, SOURCE_SCOPE};

const JOURNAL_SCHEMA_VERSION: u32 = 2;
const MAX_INTENT_BYTES: usize = 16 * 1024;
const MAX_JOURNAL_BYTES: u64 = 128 * 1024 * 1024;
const PRECISION: &str = "structural_snapshot_symbol_range_unverified";
const WORKTREE_DIGEST_SCOPE: &str = "analyzed_rust_sources";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IntentKind {
    Original,
    Interpretation,
    Proposal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BindingStatus {
    Current,
    Stale,
    Missing,
    Unverified,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentSymbolDto {
    pub node_id: String,
    pub label: String,
    pub kind: GraphNodeKind,
    pub source_range: SourceRangeDto,
    pub source_root: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IntentSnapshotDto {
    pub content_hash: String,
    pub hash_algorithm: String,
    pub byte_length: usize,
    pub captured_at: String,
    pub analysis_at: String,
    pub precision: String,
    pub repository_revision: Option<String>,
    pub worktree_digest: String,
    pub worktree_digest_scope: String,
    pub structural_snapshot: StructuralSnapshotDto,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analysis_identity: Option<AnalysisIdentity>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StructuralSnapshotDto {
    pub nodes: Vec<GraphNodeDto>,
    pub edges: Vec<GraphEdgeDto>,
}

/// A bounded, private manifest defines the exact digest coverage. No source body.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceFingerprint {
    path: String,
    content_hash: String,
    byte_length: usize,
}

/// The only record projection exposed by commands. There is no raw-source field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentRecordDto {
    pub id: String,
    pub kind: IntentKind,
    pub text: String,
    pub parent_id: Option<String>,
    pub original_id: String,
    pub created_at: String,
    pub symbol: IntentSymbolDto,
    pub snapshot: IntentSnapshotDto,
    pub binding_status: BindingStatus,
}

/// Persisted privately, never returned from IPC or included in debug output.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct JournalRecord {
    schema_version: u32,
    id: String,
    kind: IntentKind,
    text: String,
    parent_id: Option<String>,
    original_id: String,
    created_at: String,
    symbol: IntentSymbolDto,
    snapshot: IntentSnapshotDto,
    // Originals own path/digest/size coverage; derivatives reference that original.
    source_files: Option<Vec<SourceFingerprint>>,
}

pub struct AppendIntent {
    pub node_id: String,
    pub text: String,
    pub kind: IntentKind,
    pub parent_id: Option<String>,
    pub expected_analysis_at: String,
}

pub struct IntentStore {
    journal_path: PathBuf,
    gate: Mutex<()>,
}

impl IntentStore {
    pub fn new(app_data_dir: impl Into<PathBuf>) -> Self {
        Self {
            journal_path: app_data_dir.into().join("intent-journal-v2.jsonl"),
            gate: Mutex::new(()),
        }
    }

    pub fn append(
        &self,
        analysis: &AnalyzedGraph,
        request: AppendIntent,
    ) -> Result<IntentRecordDto, IntentError> {
        validate_text(&request.text)?;
        if request.expected_analysis_at != analysis.snapshot.generated_at {
            return Err(reject(
                "intent_stale_selection",
                "The selected analysis has changed. Analyze and select the symbol again.",
            ));
        }
        let (symbol, analyzed_source) = selection(analysis, &request.node_id)?;
        let source_files = source_fingerprints(analysis);
        let analysis_identity = analysis
            .syntax
            .as_ref()
            .map(|syntax| syntax.identity.clone());
        if !valid_source_files(&source_files)
            || !valid_identity_files(&source_files, analysis_identity.as_ref())
        {
            return Err(reject(
                "intent_invalid_analysis",
                "The analysis source manifest is inconsistent. Analyze again; no intent was saved.",
            ));
        }
        let worktree_digest = scoped_source_digest(&source_files, analysis_identity.as_ref());
        let structural_snapshot = structural_snapshot(analysis, &symbol.source_range.path);
        let _gate = self.gate.lock().map_err(|_| {
            reject(
                "intent_store_unavailable",
                "The intent store lock is unavailable.",
            )
        })?;
        let _file_lock = self.acquire_lock()?;
        let records = self.read_journal()?;
        let created_at = timestamp();
        let id = format!("intent:{}", records.len() + 1);
        let record = match request.kind {
            IntentKind::Original => {
                if request.parent_id.is_some() {
                    return Err(reject(
                        "intent_invalid_parent",
                        "An original intent cannot have a parent.",
                    ));
                }
                JournalRecord {
                    schema_version: if analysis_identity.is_some() {
                        3
                    } else {
                        JOURNAL_SCHEMA_VERSION
                    },
                    id: id.clone(),
                    kind: IntentKind::Original,
                    text: request.text,
                    parent_id: None,
                    original_id: id,
                    created_at: created_at.clone(),
                    symbol,
                    snapshot: IntentSnapshotDto {
                        content_hash: content_hash(analyzed_source.as_bytes()),
                        hash_algorithm: "sha256".to_owned(),
                        byte_length: analyzed_source.len(),
                        captured_at: created_at,
                        analysis_at: analysis.snapshot.generated_at.clone(),
                        precision: if analysis_identity.is_some() {
                            "syntax_byte_ranges_v1"
                        } else {
                            PRECISION
                        }
                        .to_owned(),
                        repository_revision: analysis.repository_revision.clone(),
                        worktree_digest,
                        worktree_digest_scope: if analysis_identity.is_some() {
                            SOURCE_SCOPE
                        } else {
                            WORKTREE_DIGEST_SCOPE
                        }
                        .to_owned(),
                        structural_snapshot,
                        analysis_identity: analysis_identity.clone(),
                    },
                    source_files: Some(source_files),
                }
            }
            kind @ (IntentKind::Interpretation | IntentKind::Proposal) => {
                let parent_id = request.parent_id.ok_or_else(|| {
                    reject(
                        "intent_invalid_parent",
                        "Choose the original intent for this separate entry.",
                    )
                })?;
                let original = records
                    .iter()
                    .find(|record| record.id == parent_id && record.kind == IntentKind::Original)
                    .ok_or_else(|| {
                        reject(
                            "intent_invalid_parent",
                            "The parent must be an existing original intent.",
                        )
                    })?;
                if original.symbol != symbol
                    || original.snapshot.content_hash != content_hash(analyzed_source.as_bytes())
                    || original.snapshot.byte_length != analyzed_source.len()
                    || original.snapshot.worktree_digest != worktree_digest
                    || original.snapshot.analysis_identity != analysis_identity
                    || original.snapshot.structural_snapshot != structural_snapshot
                {
                    return Err(reject("intent_stale_source", "This original belongs to a different source snapshot or selection. It has been preserved; create a new original for the current source."));
                }
                JournalRecord {
                    schema_version: original.schema_version,
                    id,
                    kind,
                    text: request.text,
                    parent_id: Some(parent_id),
                    original_id: original.id.clone(),
                    created_at,
                    symbol: original.symbol.clone(),
                    snapshot: original.snapshot.clone(),
                    source_files: None,
                }
            }
        };
        // Re-read only backend-resolved paths immediately before persistence.
        // Compare the complete current analyzed set to ephemeral parser input.
        // Neither these bytes nor any extracted source text is serialized.
        ensure_current_analysis(analysis)?;
        let mut line = serde_json::to_vec(&record).map_err(|_| {
            reject(
                "intent_serialization_failed",
                "The intent record could not be encoded.",
            )
        })?;
        line.push(b'\n');
        let existing_len = fs::metadata(&self.journal_path)
            .map(|meta| meta.len())
            .unwrap_or(0);
        if existing_len + line.len() as u64 > MAX_JOURNAL_BYTES {
            return Err(reject("intent_store_full", "The prototype journal has reached its 128 MiB limit. Existing records are preserved."));
        }
        ensure_regular_journal(&self.journal_path)?;
        let mut options = OpenOptions::new();
        options.create(true).append(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&self.journal_path)?;
        // Never truncate, rewrite, recover, or silently discard an existing line.
        file.write_all(&line)?;
        file.sync_all()?;
        #[cfg(unix)]
        if let Some(parent) = self.journal_path.parent() {
            fs::File::open(parent)?.sync_all()?;
        }
        Ok(record.dto(BindingStatus::Current))
    }

    pub fn list(
        &self,
        source_root: &str,
        analysis: Option<&AnalyzedGraph>,
    ) -> Result<Vec<IntentRecordDto>, IntentError> {
        let _gate = self.gate.lock().map_err(|_| {
            reject(
                "intent_store_unavailable",
                "The intent store lock is unavailable.",
            )
        })?;
        let _file_lock = self.acquire_lock()?;
        let records = self.read_journal()?;
        let originals: BTreeMap<_, _> = records
            .iter()
            .filter(|record| record.kind == IntentKind::Original)
            .map(|record| (record.id.as_str(), record))
            .collect();
        let mut statuses = BTreeMap::new();
        Ok(records
            .iter()
            .filter(|record| record.symbol.source_root == source_root)
            .map(|record| {
                let status = statuses
                    .entry(record.original_id.clone())
                    .or_insert_with(|| {
                        originals
                            .get(record.original_id.as_str())
                            .map(|original| binding_status(original, analysis))
                            .unwrap_or(BindingStatus::Unverified)
                    });
                record.dto(status.clone())
            })
            .collect())
    }

    fn acquire_lock(&self) -> Result<JournalLock, IntentError> {
        self.reject_legacy_journal()?;
        if let Some(parent) = self.journal_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let path = self.journal_path.with_extension("lock");
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        match options.open(&path) {
            Ok(mut file) => {
                let guard = JournalLock(path);
                write!(file, "{}", std::process::id())?;
                Ok(guard)
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                Err(IntentError::Locked)
            }
            Err(error) => Err(error.into()),
        }
    }

    fn reject_legacy_journal(&self) -> Result<(), IntentError> {
        let legacy = self.journal_path.with_file_name("intent-journal-v1.jsonl");
        match fs::symlink_metadata(legacy) {
            Ok(_) => Err(reject("intent_legacy_journal", "A legacy v1 intent journal may contain full source bodies. It was not read, copied, changed, or deleted. Close the app and archive it securely outside app data before using the source-free v2 journal.")),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    fn read_journal(&self) -> Result<Vec<JournalRecord>, IntentError> {
        self.reject_legacy_journal()?;
        ensure_regular_journal(&self.journal_path)?;
        let file = match fs::File::open(&self.journal_path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error.into()),
        };
        if file.metadata()?.len() > MAX_JOURNAL_BYTES {
            return Err(reject(
                "intent_store_full",
                "The journal exceeds the prototype's 128 MiB limit.",
            ));
        }
        let mut bytes = Vec::new();
        file.take(MAX_JOURNAL_BYTES + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_JOURNAL_BYTES {
            return Err(reject(
                "intent_store_full",
                "The journal exceeds the prototype's 128 MiB limit.",
            ));
        }
        if bytes.last().is_some_and(|last| *last != b'\n') {
            return Err(IntentError::Corrupt {
                line: bytes.iter().filter(|byte| **byte == b'\n').count() + 1,
            });
        }
        if bytes.is_empty() {
            return Ok(Vec::new());
        }
        let mut records: Vec<JournalRecord> = Vec::new();
        let mut originals = BTreeMap::<String, usize>::new();
        for (index, line) in bytes[..bytes.len() - 1]
            .split(|byte| *byte == b'\n')
            .enumerate()
        {
            let record: JournalRecord = serde_json::from_slice(line)
                .map_err(|_| IntentError::Corrupt { line: index + 1 })?;
            let valid_base = valid_analysis_scope(&record)
                && record.id == format!("intent:{}", index + 1)
                && validate_text(&record.text).is_ok()
                && valid_symbol(&record.symbol)
                && record.snapshot.hash_algorithm == "sha256"
                && valid_hash(&record.snapshot.content_hash)
                && valid_hash(&record.snapshot.worktree_digest)
                && valid_structure(&record.symbol, &record.snapshot.structural_snapshot);
            let valid_reference = if record.kind == IntentKind::Original {
                record.parent_id.is_none()
                    && record.original_id == record.id
                    && record.source_files.as_ref().is_some_and(|files| {
                        valid_source_files(files)
                            && valid_identity_files(
                                files,
                                record.snapshot.analysis_identity.as_ref(),
                            )
                            && scoped_source_digest(
                                files,
                                record.snapshot.analysis_identity.as_ref(),
                            ) == record.snapshot.worktree_digest
                            && files.iter().any(|file| {
                                file.path == record.symbol.source_range.path
                                    && file.content_hash == record.snapshot.content_hash
                                    && file.byte_length == record.snapshot.byte_length
                            })
                    })
            } else {
                originals
                    .get(&record.original_id)
                    .is_some_and(|original_index| {
                        let original = &records[*original_index];
                        record.parent_id.as_deref() == Some(original.id.as_str())
                            && record.source_files.is_none()
                            && record.symbol == original.symbol
                            && record.snapshot == original.snapshot
                    })
            };
            if !valid_base || !valid_reference {
                return Err(IntentError::Corrupt { line: index + 1 });
            }
            if record.kind == IntentKind::Original {
                originals.insert(record.id.clone(), index);
            }
            records.push(record);
        }
        Ok(records)
    }
}

impl JournalRecord {
    fn dto(&self, binding_status: BindingStatus) -> IntentRecordDto {
        IntentRecordDto {
            id: self.id.clone(),
            kind: self.kind.clone(),
            text: self.text.clone(),
            parent_id: self.parent_id.clone(),
            original_id: self.original_id.clone(),
            created_at: self.created_at.clone(),
            symbol: self.symbol.clone(),
            snapshot: self.snapshot.clone(),
            binding_status,
        }
    }
}

struct JournalLock(PathBuf);
impl Drop for JournalLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn ensure_regular_journal(path: &Path) -> Result<(), IntentError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if !metadata.file_type().is_file() => Err(reject(
            "intent_unsafe_store",
            "The intent journal must be a regular file, not a symlink or directory.",
        )),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn selection<'a>(
    analysis: &'a AnalyzedGraph,
    node_id: &str,
) -> Result<(IntentSymbolDto, &'a str), IntentError> {
    let node = analysis
        .snapshot
        .nodes
        .iter()
        .find(|node| node.id == node_id)
        .ok_or_else(|| {
            reject(
                "intent_missing_selection",
                "The selected symbol is not present in this analysis.",
            )
        })?;
    let range = node
        .source_range
        .clone()
        .ok_or_else(|| reject("intent_missing_selection", "Select a source-backed symbol."))?;
    let symbol = IntentSymbolDto {
        node_id: node.id.clone(),
        label: node.label.clone(),
        kind: node.kind.clone(),
        source_range: range,
        source_root: analysis.snapshot.source_root.clone(),
    };
    if !valid_symbol(&symbol) {
        return Err(reject(
            "intent_invalid_selection",
            "Select a source-backed symbol, not a file or workspace.",
        ));
    }
    let source = analysis
        .sources
        .get(&symbol.source_range.path)
        .ok_or_else(|| {
            reject(
                "intent_missing_snapshot",
                "The selected source was not captured during analysis. Analyze again.",
            )
        })?;
    Ok((symbol, source.as_str()))
}

fn valid_symbol(symbol: &IntentSymbolDto) -> bool {
    use std::path::Component;
    let path = Path::new(&symbol.source_range.path);
    !matches!(
        symbol.kind,
        GraphNodeKind::Workspace | GraphNodeKind::Crate | GraphNodeKind::File
    ) && !symbol.node_id.is_empty()
        && Path::new(&symbol.source_root).is_absolute()
        && !path.as_os_str().is_empty()
        && !path.is_absolute()
        && !path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
}

fn ensure_current_analysis(analysis: &AnalyzedGraph) -> Result<(), IntentError> {
    let root = validated_current_root(&analysis.snapshot.source_root)?;
    for (path, source) in &analysis.sources {
        let current = read_current_file(&root, path)?;
        if current.as_bytes() != source.as_bytes() {
            return Err(reject("intent_stale_source", "An analyzed file changed since analysis. Analyze and select the symbol again; previous intent is preserved."));
        }
    }
    Ok(())
}

fn validated_current_root(source_root: &str) -> Result<ValidatedRepoPath, IntentError> {
    let root = ValidatedRepoPath::parse_existing_source_root(source_root).map_err(|_| {
        reject(
            "intent_missing_source",
            "The analyzed source root is unavailable. No intent was saved.",
        )
    })?;
    if root.display_path() != source_root {
        return Err(reject(
            "intent_stale_source",
            "The source root now resolves elsewhere. Analyze again.",
        ));
    }
    Ok(root)
}

fn read_current_file(root: &ValidatedRepoPath, path: &str) -> Result<String, IntentError> {
    read_bounded_source(root, path)
        .map_err(|_| reject("intent_missing_source", "An analyzed file is missing, outside the source root, unreadable, or exceeds the snapshot limit. No intent was saved."))
}

fn ensure_current_fingerprints(original: &JournalRecord) -> Result<(), IntentError> {
    let root = validated_current_root(&original.symbol.source_root)?;
    let files = original.source_files.as_ref().ok_or_else(|| {
        reject(
            "intent_journal_corrupt",
            "The original's source digest coverage is unavailable.",
        )
    })?;
    for file in files {
        let current = read_current_file(&root, &file.path)?;
        if current.len() != file.byte_length
            || content_hash(current.as_bytes()) != file.content_hash
        {
            return Err(reject(
                "intent_stale_source",
                "An analyzed source digest no longer matches.",
            ));
        }
    }
    Ok(())
}

fn binding_status(original: &JournalRecord, analysis: Option<&AnalyzedGraph>) -> BindingStatus {
    if let Err(error) = ensure_current_fingerprints(original) {
        return if error.code() == "intent_stale_source" {
            BindingStatus::Stale
        } else {
            BindingStatus::Missing
        };
    }
    let Some(analysis) = analysis else {
        return BindingStatus::Unverified;
    };
    if analysis.snapshot.source_root != original.symbol.source_root {
        return BindingStatus::Unverified;
    }
    let expected_node = GraphNodeDto {
        id: original.symbol.node_id.clone(),
        kind: original.symbol.kind.clone(),
        label: original.symbol.label.clone(),
        source_range: Some(original.symbol.source_range.clone()),
    };
    if analysis
        .snapshot
        .nodes
        .iter()
        .any(|node| node == &expected_node)
        && analysis.syntax.as_ref().map(|syntax| &syntax.identity)
            == original.snapshot.analysis_identity.as_ref()
        && scoped_source_digest(
            &source_fingerprints(analysis),
            analysis.syntax.as_ref().map(|syntax| &syntax.identity),
        ) == original.snapshot.worktree_digest
        && structural_snapshot(analysis, &original.symbol.source_range.path)
            == original.snapshot.structural_snapshot
    {
        BindingStatus::Current
    } else {
        BindingStatus::Stale
    }
}

fn source_fingerprints(analysis: &AnalyzedGraph) -> Vec<SourceFingerprint> {
    analysis
        .sources
        .iter()
        .map(|(path, source)| SourceFingerprint {
            path: path.clone(),
            content_hash: content_hash(source.as_bytes()),
            byte_length: source.len(),
        })
        .collect()
}

/// Domain-separated, length-prefixed, sorted path + size + SHA-256 manifest.
/// It covers only captured Rust files, never claims the entire repository.
fn source_set_digest(files: &[SourceFingerprint]) -> String {
    let mut digest = Sha256::new();
    digest.update(b"whip-docs:analyzed-rust-sources:v1\0");
    for file in files {
        digest.update((file.path.len() as u64).to_be_bytes());
        digest.update(file.path.as_bytes());
        digest.update((file.byte_length as u64).to_be_bytes());
        digest.update(file.content_hash.as_bytes());
    }
    format!("sha256:{:x}", digest.finalize())
}

/// V2's source_set_digest is deliberately untouched. V3 is a separate domain.
fn scoped_source_digest(
    files: &[SourceFingerprint],
    identity: Option<&AnalysisIdentity>,
) -> String {
    let Some(identity) = identity else {
        return source_set_digest(files);
    };
    let mut digest = Sha256::new();
    digest.update(b"whip-docs:captured-multilingual-sources:v1\0");
    let bytes = serde_json::to_vec(&(files, identity)).expect("serializable digest metadata");
    digest.update((bytes.len() as u64).to_be_bytes());
    digest.update(bytes);
    format!("sha256:{:x}", digest.finalize())
}

fn valid_analysis_scope(record: &JournalRecord) -> bool {
    match (
        record.schema_version,
        record.snapshot.analysis_identity.as_ref(),
    ) {
        (2, None) => {
            record.snapshot.worktree_digest_scope == WORKTREE_DIGEST_SCOPE
                && record.snapshot.precision == PRECISION
        }
        (3, Some(identity)) => {
            record.snapshot.worktree_digest_scope == SOURCE_SCOPE
                && record.snapshot.precision == "syntax_byte_ranges_v1"
                && identity.schema_version == 1
                && identity.source_scope == SOURCE_SCOPE
                && valid_version_id(&identity.parser)
                && valid_version_id(&identity.extractor)
        }
        _ => false,
    }
}

fn valid_version_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-._/@:+".contains(&b))
}

fn valid_identity_files(files: &[SourceFingerprint], identity: Option<&AnalysisIdentity>) -> bool {
    let Some(identity) = identity else {
        return true;
    };
    identity.files.len() == files.len()
        && files.len() <= 4096
        && identity.files.iter().zip(files).all(|(entry, file)| {
            entry.path == file.path
                && entry.source_digest == file.content_hash
                && entry.byte_length == file.byte_length
                && valid_hash(&entry.structure_digest)
                && !entry.grammars.is_empty()
                && entry.grammars.len() <= 3
                && entry.grammars[0].dialect == entry.dialect
                && entry.grammars.iter().all(|g| valid_version_id(&g.grammar))
        })
}

fn structural_snapshot(analysis: &AnalyzedGraph, path: &str) -> StructuralSnapshotDto {
    let mut nodes: Vec<_> = analysis
        .snapshot
        .nodes
        .iter()
        .filter(|node| {
            !matches!(
                node.kind,
                GraphNodeKind::Workspace | GraphNodeKind::Crate | GraphNodeKind::File
            ) && node
                .source_range
                .as_ref()
                .is_some_and(|range| range.path == path)
        })
        .cloned()
        .collect();
    nodes.sort_by(|left, right| left.id.cmp(&right.id));
    let ids: std::collections::BTreeSet<_> = nodes.iter().map(|node| node.id.as_str()).collect();
    let mut edges: Vec<_> = analysis
        .snapshot
        .edges
        .iter()
        .filter(|edge| {
            ids.contains(edge.source_id.as_str()) && ids.contains(edge.target_id.as_str())
        })
        .cloned()
        .collect();
    edges.sort_by(|left, right| left.id.cmp(&right.id));
    drop(ids);
    StructuralSnapshotDto { nodes, edges }
}

fn valid_source_files(files: &[SourceFingerprint]) -> bool {
    !files.is_empty()
        && files.windows(2).all(|pair| pair[0].path < pair[1].path)
        && files.iter().all(|file| {
            safe_relative_path(&file.path)
                && file.byte_length as u64 <= MAX_SOURCE_BYTES
                && valid_hash(&file.content_hash)
        })
}

fn safe_relative_path(raw: &str) -> bool {
    use std::path::Component;
    let path = Path::new(raw);
    !path.as_os_str().is_empty()
        && !path.is_absolute()
        && !path
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::Prefix(_)))
}

fn valid_structure(symbol: &IntentSymbolDto, structure: &StructuralSnapshotDto) -> bool {
    let ids: std::collections::BTreeSet<_> = structure
        .nodes
        .iter()
        .map(|node| node.id.as_str())
        .collect();
    ids.len() == structure.nodes.len()
        && structure.nodes.iter().any(|node| {
            node.id == symbol.node_id
                && node.label == symbol.label
                && node.kind == symbol.kind
                && node.source_range.as_ref() == Some(&symbol.source_range)
        })
        && structure.nodes.iter().all(|node| {
            !matches!(
                node.kind,
                GraphNodeKind::Workspace | GraphNodeKind::Crate | GraphNodeKind::File
            ) && node
                .source_range
                .as_ref()
                .is_some_and(|range| range.path == symbol.source_range.path)
        })
        && structure.edges.iter().all(|edge| {
            ids.contains(edge.source_id.as_str()) && ids.contains(edge.target_id.as_str())
        })
}

fn validate_text(text: &str) -> Result<(), IntentError> {
    if text.trim().is_empty() || text.len() > MAX_INTENT_BYTES {
        return Err(reject(
            "intent_invalid_text",
            "Intent text must be nonempty and no larger than 16 KiB.",
        ));
    }
    Ok(())
}

fn content_hash(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn valid_hash(hash: &str) -> bool {
    hash.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64
            && hex
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

fn timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default();
    millis.to_string()
}

fn reject(code: &'static str, message: &str) -> IntentError {
    IntentError::Rejected {
        code,
        message: message.to_owned(),
    }
}

#[derive(Debug, thiserror::Error)]
pub enum IntentError {
    #[error("{message}")]
    Rejected { code: &'static str, message: String },
    #[error("The intent journal is corrupt or incomplete at line {line}. It was left untouched; recover from a backup before saving more records.")]
    Corrupt { line: usize },
    #[error("The intent journal is locked by another operation or an interrupted run. Close other app instances; an interrupted lock requires manual recovery.")]
    Locked,
    #[error("Intent journal I/O failed: {0}. An interrupted write may require recovery; inspect the journal before retrying.")]
    Io(#[from] std::io::Error),
}

impl IntentError {
    pub fn code(&self) -> &str {
        match self {
            Self::Rejected { code, .. } => code,
            Self::Corrupt { .. } => "intent_journal_corrupt",
            Self::Locked => "intent_journal_locked",
            Self::Io(_) => "intent_io_error",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::{GraphSnapshotDto, GRAPH_SCHEMA_VERSION};

    const SOURCE: &str =
        "// snapshot-only secret: 蟹\r\npub fn ship() { println!(\"original\"); }\r\n";
    const NODE_ID: &str = "function:fixture:src/lib.rs:ship";

    struct Fixture {
        base: PathBuf,
        root: PathBuf,
        store: IntentStore,
        analysis: AnalyzedGraph,
    }

    impl Fixture {
        fn new() -> Self {
            static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(1);
            let sequence = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let base = std::env::temp_dir().join(format!(
                "whip-intent-{}-{}-{sequence}",
                std::process::id(),
                timestamp()
            ));
            let root = base.join("repo");
            fs::create_dir_all(root.join("src")).expect("create fixture");
            fs::write(root.join("src/lib.rs"), SOURCE).expect("write fixture source");
            let source_root = ValidatedRepoPath::parse_existing_source_root(&root)
                .expect("validate fixture")
                .display_path();
            let node = GraphNodeDto {
                id: NODE_ID.to_owned(),
                kind: GraphNodeKind::Function,
                label: "ship".to_owned(),
                source_range: Some(SourceRangeDto {
                    path: "src/lib.rs".to_owned(),
                    start_line: 2,
                    start_column: 1,
                    end_line: 2,
                    end_column: 1,
                }),
            };
            Self {
                store: IntentStore::new(base.join("app")),
                base,
                root,
                analysis: AnalyzedGraph {
                    snapshot: GraphSnapshotDto {
                        schema_version: GRAPH_SCHEMA_VERSION,
                        source_root,
                        generated_at: "analysis-1".to_owned(),
                        nodes: vec![node],
                        edges: Vec::new(),
                        diagnostics: Vec::new(),
                    },
                    sources: BTreeMap::from([("src/lib.rs".to_owned(), SOURCE.to_owned())]),
                    repository_revision: None,
                    syntax: None,
                },
            }
        }

        fn request(&self, kind: IntentKind, parent_id: Option<String>) -> AppendIntent {
            AppendIntent {
                node_id: NODE_ID.to_owned(),
                text: "  Keep the user's original intent exactly.\n".to_owned(),
                kind,
                parent_id,
                expected_analysis_at: self.analysis.snapshot.generated_at.clone(),
            }
        }

        fn original(&self) -> IntentRecordDto {
            self.store
                .append(&self.analysis, self.request(IntentKind::Original, None))
                .expect("append original")
        }

        fn list(&self) -> Vec<IntentRecordDto> {
            self.store
                .list(&self.analysis.snapshot.source_root, Some(&self.analysis))
                .expect("list records")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.base);
        }
    }

    fn syntax_fixture(fixture: &mut Fixture) -> String {
        fixture.analysis = crate::syntax::analyze_repository(
            &ValidatedRepoPath::parse_existing_source_root(&fixture.root).unwrap(),
            &crate::syntax::AnalysisOptions::default(),
        );
        fixture
            .analysis
            .snapshot
            .nodes
            .iter()
            .find(|n| n.label == "ship")
            .unwrap()
            .id
            .clone()
    }

    fn syntax_request(fixture: &Fixture, node_id: &str, parent_id: Option<String>) -> AppendIntent {
        AppendIntent {
            node_id: node_id.to_owned(),
            text: "Keep original intent".to_owned(),
            kind: if parent_id.is_some() {
                IntentKind::Proposal
            } else {
                IntentKind::Original
            },
            parent_id,
            expected_analysis_at: fixture.analysis.snapshot.generated_at.clone(),
        }
    }

    #[test]
    fn multilingual_journal_identity_is_separate_and_legacy_bytes_are_preserved() {
        let mut fixture = Fixture::new();
        let legacy = fixture.original();
        let prefix = fs::read(&fixture.store.journal_path).unwrap();
        let node_id = syntax_fixture(&mut fixture);
        let current = fixture
            .store
            .append(&fixture.analysis, syntax_request(&fixture, &node_id, None))
            .unwrap();
        assert_eq!(current.snapshot.worktree_digest_scope, SOURCE_SCOPE);
        assert_eq!(legacy.snapshot.worktree_digest_scope, WORKTREE_DIGEST_SCOPE);
        assert_ne!(
            legacy.snapshot.worktree_digest,
            current.snapshot.worktree_digest
        );
        assert!(legacy.snapshot.analysis_identity.is_none());
        assert!(current.snapshot.analysis_identity.is_some());
        let bytes = fs::read(&fixture.store.journal_path).unwrap();
        assert!(bytes.starts_with(&prefix));
        let saved = String::from_utf8(bytes).unwrap();
        for forbidden in [
            "snapshot-only secret",
            "println!",
            "pub fn ship",
            "\\r\\n",
            "signature",
            "sourceText",
        ] {
            assert!(!saved.contains(forbidden), "leaked {forbidden}");
        }
        let lines: Vec<serde_json::Value> = saved
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        assert_eq!(lines[0]["schemaVersion"], 2);
        assert_eq!(lines[1]["schemaVersion"], 3);
        assert_eq!(fixture.list()[0].binding_status, BindingStatus::Stale);
        assert_eq!(fixture.list()[1].binding_status, BindingStatus::Current);
        fixture
            .store
            .append(
                &fixture.analysis,
                syntax_request(&fixture, &node_id, Some(current.id)),
            )
            .unwrap();
        let reopened = IntentStore::new(fixture.base.join("app"));
        assert_eq!(
            reopened
                .list(
                    &fixture.analysis.snapshot.source_root,
                    Some(&fixture.analysis)
                )
                .unwrap()
                .len(),
            3
        );
    }

    #[test]
    fn parser_grammar_extractor_and_dialect_changes_stale_binding_without_relink() {
        let mut fixture = Fixture::new();
        let node_id = syntax_fixture(&mut fixture);
        let original = fixture
            .store
            .append(&fixture.analysis, syntax_request(&fixture, &node_id, None))
            .unwrap();
        let identity = fixture.analysis.syntax.as_ref().unwrap().identity.clone();
        for change in 0..5 {
            let mutated = &mut fixture.analysis.syntax.as_mut().unwrap().identity;
            *mutated = identity.clone();
            match change {
                0 => mutated.parser.push_str("-new"),
                1 => mutated.extractor.push_str("-new"),
                2 => mutated.files[0].grammars[0].grammar.push_str("-new"),
                3 => {
                    mutated.files[0].dialect = crate::syntax::Dialect::TypeScript;
                    mutated.files[0].grammars[0].dialect = crate::syntax::Dialect::TypeScript;
                }
                _ => mutated.files[0].structure_digest = content_hash(b"new structure"),
            }
            assert_eq!(fixture.list()[0].binding_status, BindingStatus::Stale);
            let error = fixture
                .store
                .append(
                    &fixture.analysis,
                    syntax_request(&fixture, &node_id, Some(original.id.clone())),
                )
                .unwrap_err();
            assert_eq!(error.code(), "intent_stale_source");
        }
    }

    #[test]
    fn previous_multilingual_extractor_records_remain_readable_and_stale() {
        for previous_identity in ["whip-docs-syntax@1", "whip-docs-syntax@2"] {
            let mut fixture = Fixture::new();
            let node_id = syntax_fixture(&mut fixture);
            fixture.analysis.syntax.as_mut().unwrap().identity.extractor =
                previous_identity.to_owned();
            let previous = fixture
                .store
                .append(&fixture.analysis, syntax_request(&fixture, &node_id, None))
                .unwrap();
            let bytes = fs::read(&fixture.store.journal_path).unwrap();
            fixture.analysis.syntax.as_mut().unwrap().identity.extractor =
                crate::syntax::EXTRACTOR_ID.to_owned();
            assert_eq!(fixture.list()[0].binding_status, BindingStatus::Stale);
            let error = fixture
                .store
                .append(
                    &fixture.analysis,
                    syntax_request(&fixture, &node_id, Some(previous.id)),
                )
                .unwrap_err();
            assert_eq!(error.code(), "intent_stale_source");
            assert_eq!(bytes, fs::read(&fixture.store.journal_path).unwrap());
            assert_eq!(
                fixture.list()[0]
                    .snapshot
                    .analysis_identity
                    .as_ref()
                    .unwrap()
                    .extractor,
                previous_identity
            );
        }
    }

    #[test]
    fn inconsistent_identity_manifest_is_rejected_before_journal_write() {
        let mut fixture = Fixture::new();
        let node_id = syntax_fixture(&mut fixture);
        fixture.analysis.syntax.as_mut().unwrap().identity.files[0].path = "wrong.py".to_owned();
        let error = fixture
            .store
            .append(&fixture.analysis, syntax_request(&fixture, &node_id, None))
            .unwrap_err();
        assert_eq!(error.code(), "intent_invalid_analysis");
        assert!(!fixture.store.journal_path.exists());
    }

    #[test]
    fn multilingual_missing_or_renamed_symbol_is_never_relinked() {
        let mut fixture = Fixture::new();
        let node_id = syntax_fixture(&mut fixture);
        fixture
            .store
            .append(&fixture.analysis, syntax_request(&fixture, &node_id, None))
            .unwrap();
        fs::write(
            fixture.root.join("src/lib.rs"),
            SOURCE.replace("ship", "renamed"),
        )
        .unwrap();
        fixture.analysis = crate::syntax::analyze_repository(
            &ValidatedRepoPath::parse_existing_source_root(&fixture.root).unwrap(),
            &crate::syntax::AnalysisOptions::default(),
        );
        assert_eq!(fixture.list()[0].binding_status, BindingStatus::Stale);
        fs::remove_file(fixture.root.join("src/lib.rs")).unwrap();
        assert_eq!(fixture.list()[0].binding_status, BindingStatus::Missing);
    }

    #[test]
    fn append_preserves_original_bytes_and_separates_interpretation_and_proposal() {
        let fixture = Fixture::new();
        let original = fixture.original();
        let prefix = fs::read(&fixture.store.journal_path).expect("read first record");
        let interpretation = fixture
            .store
            .append(
                &fixture.analysis,
                fixture.request(IntentKind::Interpretation, Some(original.id.clone())),
            )
            .expect("append interpretation");
        let proposal = fixture
            .store
            .append(
                &fixture.analysis,
                fixture.request(IntentKind::Proposal, Some(original.id.clone())),
            )
            .expect("append proposal");
        let bytes = fs::read(&fixture.store.journal_path).expect("read journal");
        assert!(bytes.starts_with(&prefix));
        assert_eq!(
            fixture.list(),
            vec![original.clone(), interpretation.clone(), proposal.clone()]
        );
        assert_eq!(interpretation.original_id, original.id);
        assert_eq!(proposal.parent_id, Some(original.id.clone()));
        assert_eq!(interpretation.snapshot, original.snapshot);
        assert_eq!(proposal.symbol, original.symbol);
        assert_ne!(proposal.id, interpretation.id);
        let stored = fixture.store.read_journal().expect("read private records");
        let manifest = stored[0]
            .source_files
            .as_ref()
            .expect("private digest manifest");
        assert_eq!(manifest[0].content_hash, content_hash(SOURCE.as_bytes()));
        assert_eq!(manifest[0].byte_length, SOURCE.len());
        assert!(stored[1].source_files.is_none());
        let on_disk = String::from_utf8(bytes).expect("UTF-8 journal");
        assert!(!on_disk.contains("sourceSnapshot"));
        assert!(!on_disk.contains("snapshot-only secret"));
        assert!(!on_disk.contains("println!"));
        assert!(!on_disk.contains("蟹"));
        assert_eq!(
            original.text,
            "  Keep the user's original intent exactly.\n"
        );
    }

    #[test]
    fn restart_loads_history_without_analyzed_graph_and_never_returns_source() {
        let fixture = Fixture::new();
        let original = fixture.original();
        let restarted = IntentStore::new(fixture.base.join("app"));
        let records = restarted
            .list(&fixture.analysis.snapshot.source_root, None)
            .expect("read after restart");
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, original.id);
        assert_eq!(records[0].text, original.text);
        assert_eq!(records[0].binding_status, BindingStatus::Unverified);
        let wire = serde_json::to_string(&records).expect("serialize public DTO");
        assert!(!wire.contains("sourceSnapshot"));
        assert!(!wire.contains("snapshot-only secret"));
        assert!(!wire.contains("println!"));
        assert_eq!(records[0].snapshot.byte_length, SOURCE.len());
        assert_eq!(records[0].snapshot.precision, PRECISION);
    }

    #[test]
    fn source_change_rejects_append_and_marks_existing_intent_stale() {
        let fixture = Fixture::new();
        fixture.original();
        let before = fs::read(&fixture.store.journal_path).expect("read journal");
        fs::write(
            fixture.root.join("src/lib.rs"),
            "pub fn ship() { panic!(); }\n",
        )
        .expect("edit source");
        let error = fixture
            .store
            .append(
                &fixture.analysis,
                fixture.request(IntentKind::Original, None),
            )
            .expect_err("reject stale source");
        assert_eq!(error.code(), "intent_stale_source");
        assert_eq!(
            before,
            fs::read(&fixture.store.journal_path).expect("unchanged journal")
        );
        assert_eq!(fixture.list()[0].binding_status, BindingStatus::Stale);
    }

    #[test]
    fn reanalysis_never_relinks_derivative_to_changed_source() {
        let mut fixture = Fixture::new();
        let original = fixture.original();
        let changed = "pub fn ship() { println!(\"changed\"); }\n";
        fs::write(fixture.root.join("src/lib.rs"), changed).expect("edit source");
        fixture
            .analysis
            .sources
            .insert("src/lib.rs".to_owned(), changed.to_owned());
        fixture.analysis.snapshot.generated_at = "analysis-2".to_owned();
        let error = fixture
            .store
            .append(
                &fixture.analysis,
                fixture.request(IntentKind::Proposal, Some(original.id)),
            )
            .expect_err("reject relink");
        assert_eq!(error.code(), "intent_stale_source");
        let next = fixture.original();
        assert_eq!(next.id, "intent:2");
        assert_eq!(fixture.list()[0].binding_status, BindingStatus::Stale);
        assert_eq!(fixture.list()[1].binding_status, BindingStatus::Current);
    }

    #[test]
    fn old_graph_token_and_unknown_or_file_selection_are_rejected() {
        let mut fixture = Fixture::new();
        let mut old = fixture.request(IntentKind::Original, None);
        old.expected_analysis_at = "obsolete".to_owned();
        assert_eq!(
            fixture
                .store
                .append(&fixture.analysis, old)
                .expect_err("stale graph")
                .code(),
            "intent_stale_selection"
        );
        let mut unknown = fixture.request(IntentKind::Original, None);
        unknown.node_id = "unknown".to_owned();
        assert_eq!(
            fixture
                .store
                .append(&fixture.analysis, unknown)
                .expect_err("unknown node")
                .code(),
            "intent_missing_selection"
        );
        fixture.analysis.snapshot.nodes[0].kind = GraphNodeKind::File;
        assert_eq!(
            fixture
                .store
                .append(
                    &fixture.analysis,
                    fixture.request(IntentKind::Original, None)
                )
                .expect_err("file selection")
                .code(),
            "intent_invalid_selection"
        );
        assert!(!fixture.store.journal_path.exists());
    }

    #[test]
    fn a_renamed_file_is_missing_without_automatic_relink() {
        let fixture = Fixture::new();
        fixture.original();
        fs::rename(
            fixture.root.join("src/lib.rs"),
            fixture.root.join("src/renamed.rs"),
        )
        .expect("rename source");
        assert_eq!(fixture.list()[0].binding_status, BindingStatus::Missing);
        assert_eq!(fixture.list()[0].symbol.source_range.path, "src/lib.rs");
        assert_eq!(
            fixture
                .store
                .append(
                    &fixture.analysis,
                    fixture.request(IntentKind::Original, None)
                )
                .expect_err("missing source")
                .code(),
            "intent_missing_source"
        );
    }

    #[test]
    fn parent_must_be_original_and_belong_to_same_selection() {
        let mut fixture = Fixture::new();
        assert_eq!(
            fixture
                .store
                .append(
                    &fixture.analysis,
                    fixture.request(IntentKind::Proposal, Some("intent:100".to_owned()))
                )
                .expect_err("unknown parent")
                .code(),
            "intent_invalid_parent"
        );
        let original = fixture.original();
        let child = fixture
            .store
            .append(
                &fixture.analysis,
                fixture.request(IntentKind::Interpretation, Some(original.id.clone())),
            )
            .expect("append child");
        assert_eq!(
            fixture
                .store
                .append(
                    &fixture.analysis,
                    fixture.request(IntentKind::Proposal, Some(child.id))
                )
                .expect_err("derived parent")
                .code(),
            "intent_invalid_parent"
        );
        fixture.analysis.snapshot.nodes[0].label = "renamed".to_owned();
        assert_eq!(
            fixture
                .store
                .append(
                    &fixture.analysis,
                    fixture.request(IntentKind::Proposal, Some(original.id))
                )
                .expect_err("different selection")
                .code(),
            "intent_stale_source"
        );
    }

    #[test]
    fn absolute_and_traversal_paths_are_rejected_even_in_analyzer_metadata() {
        let mut fixture = Fixture::new();
        for path in [
            "../outside.rs".to_owned(),
            fixture
                .base
                .join("outside.rs")
                .to_string_lossy()
                .into_owned(),
        ] {
            fixture.analysis.snapshot.nodes[0]
                .source_range
                .as_mut()
                .expect("range")
                .path = path.clone();
            fixture.analysis.sources.insert(path, SOURCE.to_owned());
            assert_eq!(
                fixture
                    .store
                    .append(
                        &fixture.analysis,
                        fixture.request(IntentKind::Original, None)
                    )
                    .expect_err("unsafe path")
                    .code(),
                "intent_invalid_selection"
            );
        }
        assert!(!fixture.store.journal_path.exists());
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escape_is_rejected_without_saving_outside_source() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        let outside = fixture.base.join("outside.rs");
        fs::write(&outside, SOURCE).expect("write outside");
        fs::remove_file(fixture.root.join("src/lib.rs")).expect("remove source");
        symlink(&outside, fixture.root.join("src/lib.rs")).expect("symlink outside");
        assert_eq!(
            fixture
                .store
                .append(
                    &fixture.analysis,
                    fixture.request(IntentKind::Original, None)
                )
                .expect_err("reject escape")
                .code(),
            "intent_missing_source"
        );
        assert!(!fixture.store.journal_path.exists());
    }

    #[test]
    fn malformed_and_truncated_journal_fail_closed_without_rewriting() {
        let fixture = Fixture::new();
        fixture.original();
        let prefix = fs::read(&fixture.store.journal_path).expect("read original");
        for suffix in [
            b"{\"broken\":true}\n".as_slice(),
            b"{\"schemaVersion\":1".as_slice(),
            b"\n".as_slice(),
        ] {
            let bytes = [prefix.as_slice(), suffix].concat();
            fs::write(&fixture.store.journal_path, &bytes).expect("corrupt fixture journal");
            assert_eq!(
                fixture
                    .store
                    .list(&fixture.analysis.snapshot.source_root, None)
                    .expect_err("reject corrupt list")
                    .code(),
                "intent_journal_corrupt"
            );
            assert_eq!(
                fixture
                    .store
                    .append(
                        &fixture.analysis,
                        fixture.request(IntentKind::Original, None)
                    )
                    .expect_err("reject corrupt append")
                    .code(),
                "intent_journal_corrupt"
            );
            assert_eq!(
                bytes,
                fs::read(&fixture.store.journal_path).expect("journal preserved")
            );
        }
    }

    #[test]
    fn changed_snapshot_hash_or_reference_is_reported_as_corrupt() {
        let fixture = Fixture::new();
        let original = fixture.original();
        fixture
            .store
            .append(
                &fixture.analysis,
                fixture.request(IntentKind::Proposal, Some(original.id)),
            )
            .expect("append proposal");
        let records = fixture.store.read_journal().expect("read journal");
        let mut bad = records.clone();
        bad[1].original_id = "intent:999".to_owned();
        let mut lines = Vec::new();
        for record in bad {
            lines.extend(serde_json::to_vec(&record).expect("encode"));
            lines.push(b'\n');
        }
        fs::write(&fixture.store.journal_path, lines).expect("replace fixture data");
        assert!(matches!(
            fixture.store.read_journal(),
            Err(IntentError::Corrupt { line: 2 })
        ));
        let mut bad = records[0].clone();
        bad.source_files.as_mut().expect("manifest")[0].content_hash = content_hash(b"changed");
        let mut line = serde_json::to_vec(&bad).expect("encode");
        line.push(b'\n');
        fs::write(&fixture.store.journal_path, line).expect("replace fixture data");
        assert!(matches!(
            fixture.store.read_journal(),
            Err(IntentError::Corrupt { line: 1 })
        ));
    }

    #[test]
    fn another_process_lock_blocks_reads_and_writes_without_guessing_recovery() {
        let fixture = Fixture::new();
        fixture.original();
        let before = fs::read(&fixture.store.journal_path).expect("read bytes");
        let _guard = fixture.store.acquire_lock().expect("hold lock");
        let restarted = IntentStore::new(fixture.base.join("app"));
        assert_eq!(
            restarted
                .list(&fixture.analysis.snapshot.source_root, None)
                .expect_err("locked")
                .code(),
            "intent_journal_locked"
        );
        assert_eq!(
            restarted
                .append(
                    &fixture.analysis,
                    fixture.request(IntentKind::Original, None)
                )
                .expect_err("locked")
                .code(),
            "intent_journal_locked"
        );
        assert_eq!(
            before,
            fs::read(&fixture.store.journal_path).expect("read unchanged")
        );
    }

    #[test]
    fn repo_scoping_and_text_limits_are_explicit() {
        let fixture = Fixture::new();
        fixture.original();
        assert!(fixture
            .store
            .list("/different/repository", None)
            .expect("list another root")
            .is_empty());
        for text in ["   ".to_owned(), "x".repeat(MAX_INTENT_BYTES + 1)] {
            let mut request = fixture.request(IntentKind::Original, None);
            request.text = text;
            assert_eq!(
                fixture
                    .store
                    .append(&fixture.analysis, request)
                    .expect_err("invalid text")
                    .code(),
                "intent_invalid_text"
            );
        }
        assert_eq!(fixture.list().len(), 1);
    }

    #[test]
    fn legacy_source_bearing_journal_blocks_v2_without_reading_copying_or_deleting() {
        let fixture = Fixture::new();
        fs::create_dir_all(fixture.base.join("app")).expect("create app data");
        let legacy = fixture.base.join("app/intent-journal-v1.jsonl");
        let private_bytes = b"legacy source body and comment marker: NEVER_COPY_THIS";
        fs::write(&legacy, private_bytes).expect("write legacy fixture");
        assert_eq!(
            fixture
                .store
                .list(&fixture.analysis.snapshot.source_root, None)
                .expect_err("legacy read blocked")
                .code(),
            "intent_legacy_journal"
        );
        assert_eq!(
            fixture
                .store
                .append(
                    &fixture.analysis,
                    fixture.request(IntentKind::Original, None)
                )
                .expect_err("legacy write blocked")
                .code(),
            "intent_legacy_journal"
        );
        assert_eq!(fs::read(&legacy).expect("legacy untouched"), private_bytes);
        assert!(!fixture.store.journal_path.exists());
        assert!(!fixture.store.journal_path.with_extension("lock").exists());
    }

    #[test]
    fn structural_history_survives_restart_without_original_source_files() {
        use crate::graph::{EdgeConfidenceDto, EdgeProvenanceDto, GraphEdgeKind};
        let mut fixture = Fixture::new();
        let other_id = "function:fixture:src/lib.rs:helper";
        let mut helper = fixture.analysis.snapshot.nodes[0].clone();
        helper.id = other_id.to_owned();
        helper.label = "helper".to_owned();
        let edge = GraphEdgeDto {
            id: "calls:ship:helper".to_owned(),
            kind: GraphEdgeKind::Calls,
            source_id: NODE_ID.to_owned(),
            target_id: other_id.to_owned(),
            provenance: EdgeProvenanceDto::Syn,
            confidence: EdgeConfidenceDto::Inferred,
        };
        fixture.analysis.snapshot.nodes.push(helper);
        fixture.analysis.snapshot.edges.push(edge.clone());
        fixture.analysis.repository_revision = Some("1".repeat(40));
        let original = fixture.original();
        fs::remove_file(fixture.root.join("src/lib.rs")).expect("remove source");
        let restarted = IntentStore::new(fixture.base.join("app"));
        let records = restarted
            .list(&fixture.analysis.snapshot.source_root, None)
            .expect("recover metadata history");
        assert_eq!(records[0].binding_status, BindingStatus::Missing);
        assert_eq!(records[0].snapshot, original.snapshot);
        assert_eq!(records[0].snapshot.structural_snapshot.nodes.len(), 2);
        assert_eq!(records[0].snapshot.structural_snapshot.edges, vec![edge]);
        assert_eq!(
            records[0].snapshot.repository_revision,
            Some("1".repeat(40))
        );
        assert!(!fs::read_to_string(&restarted.journal_path)
            .expect("journal")
            .contains("snapshot-only secret"));
    }

    #[test]
    fn captured_source_set_change_is_stale_but_uncaptured_assets_are_outside_scope() {
        let mut fixture = Fixture::new();
        let extra = "pub fn extra() {}\n";
        fs::write(fixture.root.join("src/extra.rs"), extra).expect("write extra Rust file");
        fixture
            .analysis
            .sources
            .insert("src/extra.rs".to_owned(), extra.to_owned());
        let original = fixture.original();
        assert_eq!(
            original.snapshot.worktree_digest_scope,
            "analyzed_rust_sources"
        );
        fs::write(fixture.root.join("asset.txt"), "unrelated asset")
            .expect("write uncaptured asset");
        assert_eq!(fixture.list()[0].binding_status, BindingStatus::Current);
        fs::write(fixture.root.join("src/extra.rs"), "pub fn changed() {}\n")
            .expect("edit other captured source");
        assert_eq!(fixture.list()[0].binding_status, BindingStatus::Stale);
        assert_eq!(
            fixture
                .store
                .append(
                    &fixture.analysis,
                    fixture.request(IntentKind::Proposal, Some(original.id))
                )
                .expect_err("changed captured set")
                .code(),
            "intent_stale_source"
        );
    }

    #[test]
    fn structural_snapshot_keeps_only_same_file_symbols_and_internal_observed_edges() {
        use crate::graph::{EdgeConfidenceDto, EdgeProvenanceDto, GraphEdgeKind};
        let mut fixture = Fixture::new();
        let mut external = fixture.analysis.snapshot.nodes[0].clone();
        external.id = "function:other".to_owned();
        external.source_range.as_mut().expect("range").path = "src/other.rs".to_owned();
        let mut file = fixture.analysis.snapshot.nodes[0].clone();
        file.id = "file:src/lib.rs".to_owned();
        file.kind = GraphNodeKind::File;
        fixture.analysis.snapshot.nodes.extend([external, file]);
        fixture.analysis.snapshot.edges.push(GraphEdgeDto {
            id: "calls:external".to_owned(),
            kind: GraphEdgeKind::Calls,
            source_id: NODE_ID.to_owned(),
            target_id: "function:other".to_owned(),
            provenance: EdgeProvenanceDto::Syn,
            confidence: EdgeConfidenceDto::Inferred,
        });
        let original = fixture.original();
        assert_eq!(original.snapshot.structural_snapshot.nodes.len(), 1);
        assert_eq!(original.snapshot.structural_snapshot.nodes[0].id, NODE_ID);
        assert!(original.snapshot.structural_snapshot.edges.is_empty());
    }

    #[test]
    fn source_set_digest_is_path_sensitive_and_length_prefixed() {
        let vector = [SourceFingerprint {
            path: "src/lib.rs".to_owned(),
            content_hash: content_hash(b"abc"),
            byte_length: 3,
        }];
        assert_eq!(
            source_set_digest(&vector),
            "sha256:45e9fc5a539954e82932f21699e82817477627c1aa3131fe1201df9bc4a7826f"
        );
        let fixture = Fixture::new();
        let files = source_fingerprints(&fixture.analysis);
        let digest = source_set_digest(&files);
        let mut renamed = files.clone();
        renamed[0].path = "src/renamed.rs".to_owned();
        assert_ne!(digest, source_set_digest(&renamed));
        let mut resized = files;
        resized[0].byte_length += 1;
        assert_ne!(digest, source_set_digest(&resized));
    }

    #[test]
    fn sha256_known_vectors_are_stable() {
        assert_eq!(
            content_hash(b""),
            "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            content_hash(b"abc"),
            "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
