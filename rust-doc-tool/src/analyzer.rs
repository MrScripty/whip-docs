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
        let file_id = to_relative_id(file_path, &src_path)?;

        let label = file_path
            .file_name()
            .map_or_else(|| file_id.clone(), |name| name.to_string_lossy().into_owned());

        if discovered_files_set.insert(file_id.clone()) {
            graph.nodes.push(Node {
                id: file_id,
                label,
            });
        }
    }
    log::info!("Pass 1: Discovered {} Rust files.", graph.nodes.len());

    // Pass 2: Parse files to find direct `use` and `mod` declarations and their targets.
    log::debug!("Pass 2: Parsing files and finding direct interactions...");
    for node in &graph.nodes {
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
                        &mut Vec::new(), // current_path_segments for recursive calls
                        source_interactions_map,
                        source_file_id,
                        &src_path, // Pass src_path for relative resolution
                        &discovered_files_set,
                    );
                }
                Item::Mod(item_mod) => {
                    if item_mod.content.is_none() { // Handles `mod foo;`, not `mod foo { ... }`
                        let mod_name = item_mod.ident.to_string();
                        let current_dir_relative_to_src = PathBuf::from(source_file_id)
                            .parent()
                            .unwrap_or_else(|| Path::new("")) // Handle files in src root
                            .to_path_buf();

                        // Check for `module_name.rs`
                        let mod_file_rs_relative = current_dir_relative_to_src.join(format!("{}.rs", mod_name));
                        let mod_file_rs_id = mod_file_rs_relative.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

                        // Check for `module_name/mod.rs`
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
                            if target_id != *source_file_id { // Avoid self-reference for mod decl
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
                _ => {} // Other items like functions, structs, etc., are not directly analyzed for file dependencies here
            }
        }
    }

    // Pass 3: Resolve effective dependencies by traversing through `mod.rs` files
    // and create the final edges with aggregated interactions.
    log::debug!("Pass 3: Resolving effective dependencies and creating final edges...");
    let mut final_edges_map: HashMap<(String, String), HashSet<Interaction>> = HashMap::new();

    for initial_source_id in &discovered_files_set {
        if is_mod_file(initial_source_id) {
            // We typically don't want edges *from* mod.rs files in the graph,
            // as their purpose is to re-export. Their content is "merged" into parents.
            continue;
        }

        if let Some(targets_with_interactions) = direct_file_interactions.get(initial_source_id) {
            for (direct_target_id, direct_interactions_set) in targets_with_interactions {
                let mut queue: VecDeque<(String, HashSet<Interaction>)> = VecDeque::new();
                // Start BFS with the direct target and its specific interactions from the source.
                queue.push_back((direct_target_id.clone(), direct_interactions_set.clone()));

                let mut visited_in_bfs: HashSet<String> = HashSet::new();
                visited_in_bfs.insert(initial_source_id.clone()); // Don't trace back to the original source

                while let Some((current_bfs_node_id, inherited_interactions)) = queue.pop_front() {
                    if !visited_in_bfs.insert(current_bfs_node_id.clone()) {
                        continue; // Already visited this node in the current BFS path
                    }

                    if is_mod_file(&current_bfs_node_id) {
                        // If the current node is a mod.rs, its "dependencies" are things it re-exports.
                        // Continue BFS to those re-exported files, carrying over the interactions.
                        if let Some(dependencies_of_mod_file) = direct_file_interactions.get(&current_bfs_node_id) {
                            for (deeper_dependency_id, interactions_from_mod) in dependencies_of_mod_file {
                                if *initial_source_id != *deeper_dependency_id {
                                    // Combine interactions: those leading to mod.rs + those re-exported by mod.rs
                                    let mut combined_interactions = inherited_interactions.clone();
                                    combined_interactions.extend(interactions_from_mod.iter().cloned());
                                    queue.push_back((deeper_dependency_id.clone(), combined_interactions));
                                }
                            }
                        }
                    } else {
                        // This is a non-mod.rs file, so it's a final target for this path.
                        // Establish the edge from the initial_source_id to this current_bfs_node_id.
                        if *initial_source_id != current_bfs_node_id { // Ensure not a self-loop
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
                // Sort interactions for consistent output (name then kind)
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

// Recursive helper to extract imported names from a `syn::UseTree`
// and resolve them to their source files.
fn collect_interactions_from_use_tree(
    tree: &UseTree,
    current_path_segments: &mut Vec<String>, // Tracks the path in `use a::b::c;`
    source_interactions_map: &mut HashMap<String, HashSet<Interaction>>, // source_file -> (target_file -> Set<Interaction>)
    current_file_id_str: &str, // The file containing this use statement
    src_path_base: &Path,      // This is still needed to be passed down
    discovered_files_set: &HashSet<String>, // All known .rs files in src/
) {
    match tree {
        UseTree::Path(use_path) => {
            current_path_segments.push(use_path.ident.to_string());
            collect_interactions_from_use_tree(
                &use_path.tree,
                current_path_segments,
                source_interactions_map,
                current_file_id_str,
                src_path_base, // Pass it along
                discovered_files_set,
            );
            current_path_segments.pop(); // Backtrack
        }
        UseTree::Name(use_name) => {
            // This is a terminal item in a use path, e.g., `c` in `use a::b::c;`
            current_path_segments.push(use_name.ident.to_string());
            add_interaction_if_resolved(
                current_path_segments,
                &use_name.ident, // The actual item being imported
                source_interactions_map,
                current_file_id_str,
                src_path_base,
                discovered_files_set,
            );
            current_path_segments.pop(); // Backtrack
        }
        UseTree::Rename(use_rename) => {
            // e.g., `c as d` in `use a::b::c as d;`
            // The original name `c` (use_rename.ident) comes from the source module.
            // The alias `d` (use_rename.rename) is used in the current file.
            // We care about the original item for dependency tracking.
            current_path_segments.push(use_rename.ident.to_string());
            add_interaction_if_resolved(
                current_path_segments,
                &use_rename.ident, // The original name from the source module
                source_interactions_map,
                current_file_id_str,
                src_path_base,
                discovered_files_set,
            );
            current_path_segments.pop(); // Backtrack
        }
        UseTree::Glob(_) => {
            // e.g., `*` in `use a::b::*;`
            // The path to the module being glob-imported is in `current_path_segments`.
            // We create a synthetic ident "*" to represent the glob import.
            //let glob_ident = Ident::new("*", proc_macro2::Span::call_site());
            add_interaction_if_resolved(
                current_path_segments, // These segments point to the module whose contents are globbed
                //&glob_ident, // Represents the glob itself
                &Ident::new("___GLOB___", proc_macro2::Span::call_site()),
                source_interactions_map,
                current_file_id_str,
                src_path_base,
                discovered_files_set,
            );
            // No push/pop needed for glob_ident as it's not part of current_path_segments
        }
        UseTree::Group(use_group) => {
            // e.g., `{c, d}` in `use a::b::{c, d};`
            // `current_path_segments` already contains `a, b`.
            // Recursively process each item in the group.
            for item_tree_in_group in &use_group.items {
                collect_interactions_from_use_tree(
                    item_tree_in_group,
                    current_path_segments, // Pass along the current path prefix
                    source_interactions_map,
                    current_file_id_str,
                    src_path_base,
                    discovered_files_set,
                );
            }
        }
    }
}

// Helper to resolve a `use` path (represented by `path_segments`) to a file
// and add an `Interaction` record if successful.
fn add_interaction_if_resolved(
    path_segments: &[String], // Full path from `use` statement, e.g., ["crate", "module_a", "ItemName"]
    imported_item_name_ident: &Ident, // The specific item/symbol being imported (or our placeholder for glob)
    source_interactions_map: &mut HashMap<String, HashSet<Interaction>>,
    current_file_id_str: &str, // ID of the file containing the `use` statement
    src_path_base: &Path,      // Absolute path to the project's `src` directory
    discovered_files_set: &HashSet<String>, // Set of all known `*.rs` file IDs in the project
) {
    if path_segments.is_empty() {
        return; // Should not happen if called correctly
    }

    // `module_path_parts` will be the segments leading to the module file,
    // excluding the final imported item name (unless it's a glob import of a module itself).
    let module_path_parts: &[String];
    let item_name_for_interaction: String;

    if imported_item_name_ident.to_string() == "___GLOB___" { // Check for our placeholder
        // For `use some::module::*;`, path_segments is ["some", "module"].
        // The "item" is the glob, and it refers to the module defined by path_segments.
        module_path_parts = path_segments;
        item_name_for_interaction = format!("{}::*", path_segments.join("::"));
    } else if path_segments.last().map_or(false, |s| s == &imported_item_name_ident.to_string()) {
        // For `use some::module::Item;`, path_segments is ["some", "module", "Item"].
        // module_path_parts should be ["some", "module"].
        module_path_parts = &path_segments[..path_segments.len() - 1];
        item_name_for_interaction = imported_item_name_ident.to_string();
    } else {
        // This case might occur for `use my_module;` which is like `use my_module::self as my_module;`
        // or if the parsing logic for `current_path_segments` is slightly off.
        // As a fallback, assume path_segments points to the module.
        log::trace!("Ambiguous path for item '{}' with segments {:?}. Assuming segments point to module.", imported_item_name_ident, path_segments);
        module_path_parts = path_segments;
        item_name_for_interaction = imported_item_name_ident.to_string();
    }


    // Determine the starting directory for resolution based on `crate`, `super`, or relative.
    let mut base_dir_for_resolution_relative_to_src = PathBuf::new();
    let mut remaining_module_path_parts = module_path_parts;

    if !module_path_parts.is_empty() {
        match module_path_parts[0].as_str() {
            "crate" => {
                // `use crate::module::item;` -> base_dir is src root.
                // remaining_module_path_parts = ["module"]
                remaining_module_path_parts = &module_path_parts[1..];
            }
            "super" => {
                // `use super::module::item;`
                let current_file_path_obj = PathBuf::from(current_file_id_str.replace("/", std::path::MAIN_SEPARATOR_STR));
                if let Some(parent_dir) = current_file_path_obj.parent() {
                    base_dir_for_resolution_relative_to_src = parent_dir.to_path_buf();
                    remaining_module_path_parts = &module_path_parts[1..];
                } else {
                    log::warn!("Cannot resolve 'super' from src root for item '{}' in file '{}'", item_name_for_interaction, current_file_id_str);
                    return;
                }
            }
            "self" => {
                // `use self::item;` or `use self::sub_module::item;`
                // `self` refers to the current module. If current file is `foo.rs`, `self` is `foo`.
                // If current file is `foo/mod.rs`, `self` is also `foo`.
                let current_file_path_obj = PathBuf::from(current_file_id_str.replace("/", std::path::MAIN_SEPARATOR_STR));
                if is_mod_file(current_file_id_str) {
                    if let Some(parent_dir) = current_file_path_obj.parent() { // The directory containing mod.rs
                        base_dir_for_resolution_relative_to_src = parent_dir.to_path_buf();
                    }
                } else { // A file like `module.rs`, `self` refers to items within this file or its submodules
                    if let Some(parent_dir) = current_file_path_obj.parent() {
                         base_dir_for_resolution_relative_to_src = parent_dir.join(current_file_path_obj.file_stem().unwrap_or_default());
                    } else {
                         base_dir_for_resolution_relative_to_src = PathBuf::from(current_file_path_obj.file_stem().unwrap_or_default());
                    }
                }
                remaining_module_path_parts = &module_path_parts[1..];
            }
            _ => {
                // Relative path: `use my_sibling_module::item;`
                let current_file_path_obj = PathBuf::from(current_file_id_str.replace("/", std::path::MAIN_SEPARATOR_STR));
                if let Some(parent_dir) = current_file_path_obj.parent() {
                    base_dir_for_resolution_relative_to_src = parent_dir.to_path_buf();
                    // remaining_module_path_parts remains module_path_parts
                } else {
                    // current file is in src root, path is relative to src root
                    // remaining_module_path_parts remains module_path_parts
                }
            }
        }
    }


    // Construct the full path to the potential module file/directory relative to src.
    let mut potential_module_path_relative_to_src = base_dir_for_resolution_relative_to_src;
    for part in remaining_module_path_parts {
        potential_module_path_relative_to_src.push(part);
    }

    // Try to resolve to `path/to/module.rs`
    let target_file_as_rs_id = potential_module_path_relative_to_src.with_extension("rs")
        .to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

    // Try to resolve to `path/to/module/mod.rs`
    let target_file_as_mod_rs_id = potential_module_path_relative_to_src.join("mod.rs")
        .to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

    let resolved_target_file_id = if discovered_files_set.contains(&target_file_as_rs_id) {
        Some(target_file_as_rs_id)
    } else if discovered_files_set.contains(&target_file_as_mod_rs_id) {
        Some(target_file_as_mod_rs_id)
    } else if module_path_parts.is_empty() && (path_segments.first().map_or(false, |s| s == "self") || path_segments.is_empty()) {
        // `use self::Item` or `use Item` (if Item is in current file)
        // This implies the item is from the current file itself.
        // We don't create dependency edges for items within the same file.
        // However, if `self` was part of a longer path that resolved to current file, it's okay.
        // This condition is tricky. For now, if module_path_parts is empty, assume it's from current file.
        None
    }
    else {
        log::trace!(
            "Could not resolve module path '{}' (for item '{}') in file '{}' to a specific project file. Tried '{}' and '{}'",
            potential_module_path_relative_to_src.display(),
            item_name_for_interaction,
            current_file_id_str,
            target_file_as_rs_id,
            target_file_as_mod_rs_id
        );
        None
    };

    if let Some(target_id) = resolved_target_file_id {
        if target_id != current_file_id_str { // Don't record self-imports as dependencies
            source_interactions_map
                .entry(target_id) // The file where the item is defined
                .or_default()
                .insert(Interaction {
                    kind: InteractionKind::Import,
                    name: item_name_for_interaction, // The name of the item being imported
                });
        }
    }
}

fn log_graph_summary(graph: &ModuleGraph) {
    log::debug!("Graph Summary: {} nodes, {} edges.", graph.nodes.len(), graph.edges.len());
    for edge in &graph.edges {
        if !edge.interactions.is_empty() {
            log::trace!("Edge: {} -> {} (Interactions: {})", edge.source, edge.target, edge.interactions.len());
            for interaction in &edge.interactions {
                 log::trace!("  - {:?}: {}", interaction.kind, interaction.name);
            }
        }
    }
}