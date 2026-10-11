//! Whip Docs-owned syntax inventory. No compiler or external parser process.
mod registry;
pub use registry::{route, Dialect};
mod extract;
mod model;
mod repository;
mod template;
pub use extract::analyze_file;
pub use model::*;
pub use repository::{analyze_repository, AnalysisOptions};

pub(crate) fn hash(bytes: impl AsRef<[u8]>) -> String {
    use sha2::{Digest, Sha256};
    format!("sha256:{:x}", Sha256::digest(bytes))
}
#[cfg(test)]
mod tests;
