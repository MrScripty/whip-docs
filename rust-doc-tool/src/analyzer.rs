// src/analyzer.rs
use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use syn::{Ident, Item, UseTree};
use thiserror::Error;
use walkdir::WalkDir;

#[derive(Error, Debug)]
pub enum AnalyzerError {
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
    #[error("Failed to parse Rust file '{0}': {1}")]
    Parse(PathBuf, syn::Error),
    #[error("Walkdir error: {0}")]
    WalkDir(#[from] walkdir::Error),
    #[error("Could not find an 'src' directory within the provided project path: {0}")]
    SrcDirNotFound(PathBuf),
    #[error("Could not strip prefix '{prefix}' from path '{path}'")]
    PathStripError { prefix: PathBuf, path: PathBuf },
}

#[derive(Serialize, Debug, Clone)]
pub struct Node {
    pub id: String,    // e.g., "module/file.rs"
    pub label: String, // e.g., "file.rs"
    pub line_count: usize, // Number of non-comment lines of code
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")] // Ensure JS compatibility for enum variants
pub enum InteractionKind {
    Import,
    ModuleDecl,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq, Hash)]
pub struct Interaction {
    pub kind: InteractionKind,
    pub name: String, // Name of the imported item, declared module, etc.
}

#[derive(Serialize, Debug, Clone)]
pub struct Edge {
    pub source: String,
    pub target: String,
    pub interactions: Vec<Interaction>,
}

#[derive(Serialize, Debug, Default)]
pub struct ModuleGraph {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

// Helper to count non-comment lines of code
fn count_code_lines(content: &str) -> usize {
    let mut count = 0;
    let mut in_block_comment = false;

    for line_str in content.lines() {
        let mut current_segment = line_str.trim_start(); 
        let original_trimmed_line_is_empty = current_segment.is_empty();
        let mut has_code_on_this_line = false;

        if original_trimmed_line_is_empty {
            continue; 
        }
        
        while !current_segment.is_empty() {
            if in_block_comment {
                if let Some(end_comment_idx) = current_segment.find("*/") {
                    in_block_comment = false;
                    current_segment = current_segment[end_comment_idx + 2..].trim_start();
                } else {
                    current_segment = ""; 
                }
            } else { 
                if let Some(start_comment_idx) = current_segment.find("/*") {
                    let code_before_block = current_segment[..start_comment_idx].trim();
                    if !code_before_block.is_empty() && !code_before_block.starts_with("//") {
                        has_code_on_this_line = true;
                    }
                    in_block_comment = true;
                    current_segment = current_segment[start_comment_idx..].trim_start(); 
                } else if let Some(line_comment_idx) = current_segment.find("//") {
                    let code_before_line_comment = current_segment[..line_comment_idx].trim();
                    if !code_before_line_comment.is_empty() {
                        has_code_on_this_line = true;
                    }
                    current_segment = ""; 
                } else {
                    if !current_segment.trim().is_empty() { 
                         has_code_on_this_line = true;
                    }
                    current_segment = ""; 
                }
            }
        }

        if has_code_on_this_line {
            count += 1;
        }
    }
    count
}


// Helper to check if a file ID string refers to a "mod.rs" file.
fn is_mod_file(file_id: &str) -> bool {
    Path::new(file_id).file_name() == Some(std::ffi::OsStr::new("mod.rs"))
}

// Helper to create a clean relative path string (e.g., "module/file.rs")
fn to_relative_id(path: &Path, base: &Path) -> Result<String, AnalyzerError> {
    Ok(path.strip_prefix(base)
        .map_err(|_| AnalyzerError::PathStripError {
            prefix: base.to_path_buf(),
            path: path.to_path_buf(),
        })?
        .to_string_lossy()
        .replace(std::path::MAIN_SEPARATOR, "/")
    )
}

pub fn analyze_project(project_path: &Path) -> Result<ModuleGraph, AnalyzerError> {
    log::info!(
        "Starting analysis. Searching for 'src' directory within: {}",
        project_path.display()
    );

    let src_path_option = WalkDir::new(project_path)
        .max_depth(3) // Limit search depth for "src"
        .into_iter()
        .filter_map(|e| e.ok())
        .find(|e| e.file_type().is_dir() && e.file_name() == "src");

    let src_path = match src_path_option {
        Some(entry) => {
            let found_path = entry.path().to_path_buf();
            log::info!("Found 'src' directory at: {}", found_path.display());
            found_path
        }
        None => {
            log::error!(
                "Could not find an 'src' directory within '{}'",
                project_path.display()
            );
            return Err(AnalyzerError::SrcDirNotFound(project_path.to_path_buf()));
        }
    };

    let mut graph = ModuleGraph::default();
    let mut discovered_files_set: HashSet<String> = HashSet::new();
    // Stores direct interactions: source_file_id -> (target_file_id -> Set<Interaction>)
    let mut direct_file_interactions: HashMap<String, HashMap<String, HashSet<Interaction>>> =
        HashMap::new();

    // Pass 1: Discover all Rust files and create nodes.
    log::debug!("Pass 1: Discovering Rust files in {}...", src_path.display());
    for entry in WalkDir::new(&src_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "rs"))
    {
        let file_path = entry.path();
        
        let content_for_line_count = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(e) => {
                log::warn!("Could not read file {} for line count: {}. Defaulting to 0 lines.", file_path.display(), e);
                String::new() // Empty string will result in 0 lines for count_code_lines
            }
        };
        let line_count = count_code_lines(&content_for_line_count);
        
        let file_id = to_relative_id(file_path, &src_path)?;

        let label = file_path
            .file_name()
            .map_or_else(|| file_id.clone(), |name| name.to_string_lossy().into_owned());

        if discovered_files_set.insert(file_id.clone()) {
            graph.nodes.push(Node {
                id: file_id,
                label,
                line_count, // Store the calculated line count
            });
        }
    }
    log::info!("Pass 1: Discovered {} Rust files.", graph.nodes.len());

    // Pass 2: Parse files to find direct `use` and `mod` declarations and their targets.
    log::debug!("Pass 2: Parsing files and finding direct interactions...");
    for node in &graph.nodes { // Iterate over a copy or indices if modifying graph.nodes
        let source_file_id = &node.id;
        let file_path = src_path.join(source_file_id.replace("/", std::path::MAIN_SEPARATOR_STR));

        let content = match fs::read_to_string(&file_path) {
            Ok(c) => c,
            Err(e) => {
                log::warn!(
                    "Could not read file {}: {}. Skipping for direct interaction analysis.",
                    file_path.display(),
                    e
                );
                continue;
            }
        };
        let ast = match syn::parse_file(&content) {
            Ok(a) => a,
            Err(e) => {
                log::warn!(
                    "Could not parse file {}: {}. Skipping for direct interaction analysis.",
                    file_path.display(),
                    e
                );
                // Store 0 for line count if parsing fails for AST, though line count is done before this
                continue;
            }
        };

        let source_interactions_map = direct_file_interactions
            .entry(source_file_id.clone())
            .or_default();

        for item in ast.items {
            match item {
                Item::Use(item_use) => {
                    collect_interactions_from_use_tree(
                        &item_use.tree,
                        &mut Vec::new(), 
                        source_interactions_map,
                        source_file_id,
                        &src_path, 
                        &discovered_files_set,
                    );
                }
                Item::Mod(item_mod) => {
                    if item_mod.content.is_none() { 
                        let mod_name = item_mod.ident.to_string();
                        let current_dir_relative_to_src = PathBuf::from(source_file_id)
                            .parent()
                            .unwrap_or_else(|| Path::new("")) 
                            .to_path_buf();

                        let mod_file_rs_relative = current_dir_relative_to_src.join(format!("{}.rs", mod_name));
                        let mod_file_rs_id = mod_file_rs_relative.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

                        let mod_dir_mod_rs_relative = current_dir_relative_to_src.join(&mod_name).join("mod.rs");
                        let mod_dir_mod_rs_id = mod_dir_mod_rs_relative.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

                        let target_file_id_option = if discovered_files_set.contains(&mod_file_rs_id) {
                            Some(mod_file_rs_id)
                        } else if discovered_files_set.contains(&mod_dir_mod_rs_id) {
                            Some(mod_dir_mod_rs_id)
                        } else {
                            None
                        };

                        if let Some(target_id) = target_file_id_option {
                            if target_id != *source_file_id { 
                                source_interactions_map
                                    .entry(target_id)
                                    .or_default()
                                    .insert(Interaction {
                                        kind: InteractionKind::ModuleDecl,
                                        name: mod_name.clone(),
                                    });
                            }
                        } else {
                             log::trace!("Could not resolve 'mod {};' in file '{}' to an existing project file.", mod_name, source_file_id);
                        }
                    }
                }
                _ => {} 
            }
        }
    }

    // Pass 3: Resolve effective dependencies by traversing through `mod.rs` files
    log::debug!("Pass 3: Resolving effective dependencies and creating final edges...");
    let mut final_edges_map: HashMap<(String, String), HashSet<Interaction>> = HashMap::new();

    for initial_source_id in &discovered_files_set {
        if is_mod_file(initial_source_id) {
            continue;
        }

        if let Some(targets_with_interactions) = direct_file_interactions.get(initial_source_id) {
            for (direct_target_id, direct_interactions_set) in targets_with_interactions {
                let mut queue: VecDeque<(String, HashSet<Interaction>)> = VecDeque::new();
                queue.push_back((direct_target_id.clone(), direct_interactions_set.clone()));

                let mut visited_in_bfs: HashSet<String> = HashSet::new();
                visited_in_bfs.insert(initial_source_id.clone()); 

                while let Some((current_bfs_node_id, inherited_interactions)) = queue.pop_front() {
                    if !visited_in_bfs.insert(current_bfs_node_id.clone()) {
                        continue; 
                    }

                    if is_mod_file(&current_bfs_node_id) {
                        if let Some(dependencies_of_mod_file) = direct_file_interactions.get(&current_bfs_node_id) {
                            for (deeper_dependency_id, interactions_from_mod) in dependencies_of_mod_file {
                                if *initial_source_id != *deeper_dependency_id {
                                    let mut combined_interactions = inherited_interactions.clone();
                                    combined_interactions.extend(interactions_from_mod.iter().cloned());
                                    queue.push_back((deeper_dependency_id.clone(), combined_interactions));
                                }
                            }
                        }
                    } else {
                        if *initial_source_id != current_bfs_node_id { 
                            log::trace!("Effective edge: {} -> {} with interactions: {:?}", initial_source_id, current_bfs_node_id, inherited_interactions);
                            final_edges_map
                                .entry((initial_source_id.clone(), current_bfs_node_id.clone()))
                                .or_default()
                                .extend(inherited_interactions.iter().cloned());
                        }
                    }
                }
            }
        }
    }

    graph.edges = final_edges_map
        .into_iter()
        .map(|((s, t), interactions_set)| Edge {
            source: s,
            target: t,
            interactions: {
                let mut v: Vec<_> = interactions_set.into_iter().collect();
                v.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| format!("{:?}",a.kind).cmp(&format!("{:?}",b.kind))));
                v
            }
        })
        .collect();

    log::info!("Pass 3: Created {} final edges.", graph.edges.len());
    log_graph_summary(&graph);
    log::info!("Analysis complete.");
    Ok(graph)
}

fn collect_interactions_from_use_tree(
    tree: &UseTree,
    current_path_segments: &mut Vec<String>, 
    source_interactions_map: &mut HashMap<String, HashSet<Interaction>>, 
    current_file_id_str: &str, 
    src_path_base: &Path,      
    discovered_files_set: &HashSet<String>, 
) {
    match tree {
        UseTree::Path(use_path) => {
            current_path_segments.push(use_path.ident.to_string());
            collect_interactions_from_use_tree(
                &use_path.tree,
                current_path_segments,
                source_interactions_map,
                current_file_id_str,
                src_path_base, 
                discovered_files_set,
            );
            current_path_segments.pop(); 
        }
        UseTree::Name(use_name) => {
            current_path_segments.push(use_name.ident.to_string());
            add_interaction_if_resolved(
                current_path_segments,
                &use_name.ident, 
                source_interactions_map,
                current_file_id_str,
                src_path_base,
                discovered_files_set,
            );
            current_path_segments.pop(); 
        }
        UseTree::Rename(use_rename) => {
            current_path_segments.push(use_rename.ident.to_string());
            add_interaction_if_resolved(
                current_path_segments,
                &use_rename.ident, 
                source_interactions_map,
                current_file_id_str,
                src_path_base,
                discovered_files_set,
            );
            current_path_segments.pop(); 
        }
        UseTree::Glob(_) => {
            add_interaction_if_resolved(
                current_path_segments, 
                &Ident::new("___GLOB___", proc_macro2::Span::call_site()),
                source_interactions_map,
                current_file_id_str,
                src_path_base,
                discovered_files_set,
            );
        }
        UseTree::Group(use_group) => {
            for item_tree_in_group in &use_group.items {
                collect_interactions_from_use_tree(
                    item_tree_in_group,
                    current_path_segments, 
                    source_interactions_map,
                    current_file_id_str,
                    src_path_base,
                    discovered_files_set,
                );
            }
        }
    }
}

fn add_interaction_if_resolved(
    path_segments: &[String], 
    imported_item_name_ident: &Ident, 
    source_interactions_map: &mut HashMap<String, HashSet<Interaction>>,
    current_file_id_str: &str, 
    _src_path_base: &Path,      // Not directly used for path construction here, but kept for signature consistency
    discovered_files_set: &HashSet<String>, 
) {
    if path_segments.is_empty() {
        return; 
    }

    let module_path_parts: &[String];
    let mut item_name_for_interaction: String;

    if imported_item_name_ident.to_string() == "___GLOB___" { 
        module_path_parts = path_segments;
        item_name_for_interaction = format!("{}::*", path_segments.join("::")); // Represent glob as "module::*"
         if path_segments.is_empty() { // e.g. use *; (highly unlikely but guard)
            item_name_for_interaction = "*".to_string();
        }
    } else if path_segments.last().map_or(false, |s| s == &imported_item_name_ident.to_string()) {
        module_path_parts = &path_segments[..path_segments.len() - 1];
        item_name_for_interaction = imported_item_name_ident.to_string();
    } else {
        log::trace!("Ambiguous path for item '{}' with segments {:?}. Assuming segments point to module.", imported_item_name_ident, path_segments);
        module_path_parts = path_segments;
        item_name_for_interaction = imported_item_name_ident.to_string();
    }

    let mut base_dir_for_resolution_relative_to_src = PathBuf::new();
    let mut remaining_module_path_parts = module_path_parts;

    if !module_path_parts.is_empty() {
        match module_path_parts[0].as_str() {
            "crate" => {
                remaining_module_path_parts = &module_path_parts[1..];
            }
            "super" => {
                let current_file_path_obj = PathBuf::from(current_file_id_str.replace("/", std::path::MAIN_SEPARATOR_STR));
                if let Some(parent_dir) = current_file_path_obj.parent().and_then(|p| p.parent()) { // parent of current file's dir
                    base_dir_for_resolution_relative_to_src = parent_dir.to_path_buf();
                    remaining_module_path_parts = &module_path_parts[1..];
                } else { // current file is in src or src/module.rs, super refers to src
                     base_dir_for_resolution_relative_to_src = PathBuf::new(); // effectively src/
                     remaining_module_path_parts = &module_path_parts[1..];
                }
            }
            "self" => {
                let current_file_path_obj = PathBuf::from(current_file_id_str.replace("/", std::path::MAIN_SEPARATOR_STR));
                if is_mod_file(current_file_id_str) {
                    if let Some(parent_dir) = current_file_path_obj.parent() { 
                        base_dir_for_resolution_relative_to_src = parent_dir.to_path_buf();
                    }
                } else { 
                    if let Some(parent_dir) = current_file_path_obj.parent() {
                         base_dir_for_resolution_relative_to_src = parent_dir.join(current_file_path_obj.file_stem().unwrap_or_default());
                    } else {
                         base_dir_for_resolution_relative_to_src = PathBuf::from(current_file_path_obj.file_stem().unwrap_or_default());
                    }
                }
                remaining_module_path_parts = &module_path_parts[1..];
            }
            _ => {
                let current_file_path_obj = PathBuf::from(current_file_id_str.replace("/", std::path::MAIN_SEPARATOR_STR));
                if let Some(parent_dir) = current_file_path_obj.parent() {
                    base_dir_for_resolution_relative_to_src = parent_dir.to_path_buf();
                } 
            }
        }
    }


    let mut potential_module_path_relative_to_src = base_dir_for_resolution_relative_to_src;
    for part in remaining_module_path_parts {
        potential_module_path_relative_to_src.push(part);
    }

    let target_file_as_rs_id = potential_module_path_relative_to_src.with_extension("rs")
        .to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

    let target_file_as_mod_rs_id = potential_module_path_relative_to_src.join("mod.rs")
        .to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

    let resolved_target_file_id = if discovered_files_set.contains(&target_file_as_rs_id) {
        Some(target_file_as_rs_id)
    } else if discovered_files_set.contains(&target_file_as_mod_rs_id) {
        Some(target_file_as_mod_rs_id)
    } else if module_path_parts.is_empty() && 
              (path_segments.first().map_or(false, |s| s == "self" || s == "crate") || path_segments.is_empty()) &&
              item_name_for_interaction != format!("{}::*", path_segments.join("::")) // Not a glob of self/crate
    {
        // `use self::Item` or `use Item` (if Item is in current file) or `use crate::Item` (if Item is in lib.rs/main.rs)
        // If module_path_parts is empty, it implies the item is sought in the current file's scope or root scope.
        // If path_segments starts with "crate" and module_path_parts is empty, it means `use crate::Item;`
        // This should resolve to lib.rs or main.rs if they exist at src root.
        let root_file_candidates = ["lib.rs", "main.rs"];
        let mut found_root_candidate = None;
        if path_segments.first().map_or(false, |s| s == "crate") && module_path_parts.is_empty() {
            for candidate in root_file_candidates.iter() {
                if discovered_files_set.contains(*candidate) {
                    found_root_candidate = Some(candidate.to_string());
                    break;
                }
            }
        }
        // If it's `use self::Item` or `use Item` (local), it's from the current file.
        // If it's `use crate::Item` and resolves to a root file, that's the target.
        // Otherwise, it's an unresolved local item or an item from the current file.
        if found_root_candidate.is_some() {
            found_root_candidate
        } else if path_segments.first().map_or(false, |s| s == "self") || module_path_parts.is_empty() {
             None // Assumed to be from current file, no edge needed
        } else {
            None
        }
    }
    else {
        log::trace!(
            "Could not resolve module path '{}' (for item '{}') in file '{}' to a specific project file. Tried '{}' and '{}'. Path segments: {:?}",
            potential_module_path_relative_to_src.display(),
            item_name_for_interaction,
            current_file_id_str,
            target_file_as_rs_id,
            target_file_as_mod_rs_id,
            path_segments
        );
        None
    };

    if let Some(target_id) = resolved_target_file_id {
        if target_id != current_file_id_str { 
            source_interactions_map
                .entry(target_id) 
                .or_default()
                .insert(Interaction {
                    kind: InteractionKind::Import,
                    name: item_name_for_interaction, 
                });
        }
    }
}

fn log_graph_summary(graph: &ModuleGraph) {
    log::debug!("Graph Summary: {} nodes, {} edges.", graph.nodes.len(), graph.edges.len());
    for node in &graph.nodes {
        log::trace!("Node: {} ({}), Lines: {}", node.id, node.label, node.line_count);
    }
    for edge in &graph.edges {
        if !edge.interactions.is_empty() {
            log::trace!("Edge: {} -> {} (Interactions: {})", edge.source, edge.target, edge.interactions.len());
            for interaction in &edge.interactions {
                 log::trace!("  - {:?}: {}", interaction.kind, interaction.name);
            }
        }
    }
}