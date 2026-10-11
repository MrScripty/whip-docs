//! Export real service DTOs and a source-free journal vector for the browser fixture.
use std::collections::BTreeMap;
use whip_docs::{
    commands::AppState,
    config::{AppConfigDto, ConfigStore},
    intent::{AppendIntent, IntentKind},
    syntax::{AnalysisOptions, Dialect},
};

#[tokio::main]
async fn main() {
    let args: Vec<_> = std::env::args().collect();
    let root = std::fs::canonicalize(&args[1])
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let state = AppState::new(ConfigStore::new(&args[2]), AppConfigDto::default());
    state.set_source_repo_path(root.clone()).await.unwrap();
    let files = state.load_file_relation_graph(root.clone()).await.unwrap();
    let symbols = state.analyze_source_repo().await.unwrap();
    let analysis = state
        .source_analysis_for(Some(&root), Some(&symbols.generated_at))
        .await
        .unwrap()
        .unwrap();
    let overrides = BTreeMap::from([
        ("include/api.h".to_owned(), Dialect::Cpp),
        ("web/View.js".to_owned(), Dialect::Jsx),
    ]);
    let options = AnalysisOptions {
        dialect_overrides: overrides,
        ..Default::default()
    };
    let overridden_symbols = state
        .analyze_source_repo_with_options(options)
        .await
        .unwrap();
    let overridden_analysis = state
        .source_analysis_for(Some(&root), Some(&overridden_symbols.generated_at))
        .await
        .unwrap()
        .unwrap();
    let node = overridden_symbols
        .nodes
        .iter()
        .find(|node| {
            node.source_range
                .as_ref()
                .is_some_and(|r| r.path == "api/handler.py")
                && node.kind == whip_docs::graph::GraphNodeKind::Class
        })
        .unwrap();
    let record = state
        .append_intent_record(AppendIntent {
            node_id: node.id.clone(),
            text: "  Preserve this public fixture intent — 蟹.\n\tKeep proposals separate.  "
                .to_owned(),
            kind: IntentKind::Original,
            parent_id: None,
            expected_analysis_at: overridden_symbols.generated_at.clone(),
        })
        .await
        .unwrap();
    println!("{}", serde_json::to_string_pretty(&serde_json::json!({"files": files, "symbols": symbols, "analysis": analysis, "overriddenSymbols": overridden_symbols, "overriddenAnalysis": overridden_analysis, "journalVector":record})).unwrap());
    state.shutdown_services().await.unwrap();
}
