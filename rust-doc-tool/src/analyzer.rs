// src/analyzer.rs

use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use syn::{Item, UseTree};
use thiserror::Error;
use walkdir::WalkDir; // Keep WalkDir import

#[derive(Error, Debug)]
pub enum AnalyzerError {
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
    #[error("Failed to parse Rust file '{0}': {1}")]
    Parse(PathBuf, syn::Error),
    #[error("Walkdir error: {0}")]
    WalkDir(#[from] walkdir::Error),
    // Updated error message
    #[error("Could not find an 'src' directory within the provided project path: {0}")]
    SrcDirNotFound(PathBuf),
    #[error("Could not strip prefix '{prefix}' from path '{path}'")]
    PathStripError { prefix: PathBuf, path: PathBuf },
}

// --- Data Structures for JSON Output --- (remain the same)
#[derive(Serialize, Debug, Clone)]
pub struct Node {
    id: String,
    label: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct Edge {
    source: String,
    target: String,
}

#[derive(Serialize, Debug, Default)]
pub struct ModuleGraph {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}


// --- Analysis Logic ---

/// Analyzes the Rust project at the given path and generates a module graph.
pub fn analyze_project(project_path: &Path) -> Result<ModuleGraph, AnalyzerError> {
    log::info!(
        "Starting analysis. Searching for 'src' directory within: {}",
        project_path.display()
    );

    // --- Search for the 'src' directory ---
    let src_path_option = WalkDir::new(project_path)
        .max_depth(3) // Limit search depth to avoid going into target/ etc. Adjust if needed.
        .into_iter()
        .filter_map(|e| e.ok()) // Convert Result<DirEntry, Error> to Option<DirEntry>
        .find(|e| e.file_type().is_dir() && e.file_name() == "src"); // Find first directory named "src"

    let src_path = match src_path_option {
        Some(entry) => {
            let found_path = entry.path().to_path_buf();
            log::info!("Found 'src' directory at: {}", found_path.display());
            found_path // Use the path of the found 'src' directory
        }
        None => {
            // If no 'src' directory is found after searching
            log::error!(
                "Could not find an 'src' directory within '{}'",
                project_path.display()
            );
            return Err(AnalyzerError::SrcDirNotFound(project_path.to_path_buf()));
        }
    };
    // --- End of search ---


    // --- The rest of the analysis proceeds using the *found* src_path ---
    let mut graph = ModuleGraph::default();
    let mut discovered_files = HashSet::new();
    let mut file_dependencies: HashMap<String, HashSet<String>> = HashMap::new();

    // Pass 1: Discover all .rs files and create nodes (using the found src_path)
    log::debug!("Pass 1: Discovering Rust files in {}...", src_path.display());
    for entry in WalkDir::new(&src_path) // Start walking from the found src_path
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "rs"))
    {
        let file_path = entry.path();
        // Strip the found src_path prefix to get the relative ID
        let relative_path = file_path
            .strip_prefix(&src_path) // Use the found src_path here
            .map_err(|_| AnalyzerError::PathStripError {
                prefix: src_path.clone(), // Use the found src_path here
                path: file_path.to_path_buf(),
            })?;

        let file_id = relative_path
            .to_string_lossy()
            .replace(std::path::MAIN_SEPARATOR, "/");

        let label = file_path
            .file_name()
            .map_or_else(|| file_id.clone(), |name| name.to_string_lossy().into_owned());

        log::trace!("Discovered file: {} (ID: {})", file_path.display(), file_id);
        graph.nodes.push(Node {
            id: file_id.clone(),
            label,
        });
        discovered_files.insert(file_id);
    }
     log::info!("Pass 1: Discovered {} Rust files.", graph.nodes.len());


    // Pass 2: Parse files and find dependencies (using the found src_path)
    log::debug!("Pass 2: Parsing files and finding dependencies...");
    for node in &graph.nodes {
        let file_id = &node.id;
        // Reconstruct absolute path from ID relative to the found src_path
        let file_path = src_path.join(file_id.replace("/", std::path::MAIN_SEPARATOR_STR)); // Use found src_path

        log::trace!("Parsing file: {}", file_path.display());
        let content = fs::read_to_string(&file_path)?;
        let ast = syn::parse_file(&content)
            .map_err(|e| AnalyzerError::Parse(file_path.clone(), e))?;

        let current_deps = file_dependencies.entry(file_id.clone()).or_default();

        for item in ast.items {
            match item {
                Item::Use(item_use) => {
                    // Pass the found src_path to the helper
                    find_dependencies_in_use_tree(&item_use.tree, current_deps, file_id, &src_path);
                }
                Item::Mod(item_mod) => {
                    if item_mod.content.is_none() {
                        let mod_name = item_mod.ident.to_string();
                        // Calculate relative path based on file_id (which is relative to src_path)
                        let current_dir_relative = PathBuf::from(file_id).parent().unwrap_or_else(|| Path::new("")).to_path_buf();

                        let mod_file_rs_relative = current_dir_relative.join(format!("{}.rs", mod_name));
                        let mod_file_rs_id = mod_file_rs_relative.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

                        let mod_file_mod_rs_relative = current_dir_relative.join(&mod_name).join("mod.rs");
                        let mod_file_mod_rs_id = mod_file_mod_rs_relative.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

                        // Check against discovered_files (which contains IDs relative to src_path)
                        if discovered_files.contains(&mod_file_rs_id) {
                             log::trace!("  Found mod dependency: {} -> {}", file_id, mod_file_rs_id);
                             current_deps.insert(mod_file_rs_id);
                        } else if discovered_files.contains(&mod_file_mod_rs_id) {
                             log::trace!("  Found mod dependency: {} -> {}", file_id, mod_file_mod_rs_id);
                             current_deps.insert(mod_file_mod_rs_id);
                        } else {
                            log::warn!("Could not resolve 'mod {};' in file '{}' to an existing file relative to src.", mod_name, file_id);
                        }
                    }
                }
                _ => {}
            }
        }
    }

    // Pass 3: Create edges from dependencies (remains the same logic)
    log::debug!("Pass 3: Creating edges...");
    for (source_id, targets) in file_dependencies {
        for target_id in targets {
            if discovered_files.contains(&target_id) {
                 log::trace!("Creating edge: {} -> {}", source_id, target_id);
                 graph.edges.push(Edge {
                    source: source_id.clone(),
                    target: target_id,
                });
            } else {
                 log::warn!("Skipping edge from '{}' to non-existent target '{}'", source_id, target_id);
            }
        }
    }
    log::info!("Pass 3: Created {} edges.", graph.edges.len());


    log::info!("Analysis complete.");
    Ok(graph)
}


// Helper to recursively process `use` trees (needs src_path)
fn find_dependencies_in_use_tree(
    tree: &UseTree,
    deps: &mut HashSet<String>,
    current_file_id: &str, // e.g., "gui_framework/plugins/interaction.rs"
    src_path: &Path,
) {
     match tree {
        UseTree::Path(use_path) => {
            if let Some(first_segment) = use_path.ident.to_string().as_str().into() {
                 match first_segment {
                    "crate" => {
                        // --- crate:: logic remains the same ---
                        let mut path_segments = Vec::new();
                        collect_path_segments(&*use_path.tree, &mut path_segments);

                        if !path_segments.is_empty() {
                            let potential_target_base_relative = PathBuf::from(path_segments.join(std::path::MAIN_SEPARATOR_STR));

                            let target_rs_relative = potential_target_base_relative.with_extension("rs");
                            let target_rs_id = target_rs_relative.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

                            let target_mod_rs_relative = potential_target_base_relative.join("mod.rs");
                            let target_mod_rs_id = target_mod_rs_relative.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

                            if src_path.join(&target_rs_relative).exists() {
                                log::trace!("  Found use dependency (crate): {} -> {}", current_file_id, target_rs_id);
                                deps.insert(target_rs_id);
                            } else if src_path.join(&target_mod_rs_relative).exists() {
                                log::trace!("  Found use dependency (crate): {} -> {}", current_file_id, target_mod_rs_id);
                                deps.insert(target_mod_rs_id);
                            } else {
                                log::trace!("  Use path 'crate::{}' likely refers to an item, not a file.", path_segments.join("::"));
                            }
                        }
                        // --- End of crate:: logic ---
                    }
                    "super" => {
                        // --- Add logic for super:: ---
                        let current_file_relative_path = PathBuf::from(current_file_id.replace("/", std::path::MAIN_SEPARATOR_STR));
                        if let Some(parent_dir_relative) = current_file_relative_path.parent() {
                            let mut path_segments = Vec::new();
                            collect_path_segments(&*use_path.tree, &mut path_segments); // Get the rest of the path (e.g., ["components", "Shape"])

                            if !path_segments.is_empty() {
                                // Construct path relative to parent dir
                                let potential_target_base_relative = parent_dir_relative.join(path_segments.join(std::path::MAIN_SEPARATOR_STR));

                                // Check for module.rs or module/mod.rs relative to src
                                let target_rs_relative = potential_target_base_relative.with_extension("rs");
                                let target_rs_id = target_rs_relative.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

                                let target_mod_rs_relative = potential_target_base_relative.join("mod.rs");
                                let target_mod_rs_id = target_mod_rs_relative.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

                                // Check if these resolved paths exist relative to src_path
                                if src_path.join(&target_rs_relative).exists() {
                                    log::trace!("  Found use dependency (super): {} -> {}", current_file_id, target_rs_id);
                                    deps.insert(target_rs_id);
                                } else if src_path.join(&target_mod_rs_relative).exists() {
                                    log::trace!("  Found use dependency (super): {} -> {}", current_file_id, target_mod_rs_id);
                                    deps.insert(target_mod_rs_id);
                                } else {
                                     log::trace!("  Use path 'super::{}' likely refers to an item, not a file.", path_segments.join("::"));
                                }
                            } else {
                                log::warn!("Encountered 'use super;' without further path segments in '{}'. This usually refers to the parent mod file.", current_file_id);
                                // Attempt to resolve to parent's mod.rs or parent_dir.rs
                                let parent_mod_rs = parent_dir_relative.join("mod.rs");
                                let parent_mod_rs_id = parent_mod_rs.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
                                // Check parent_dir.rs (e.g. if parent is 'foo', check 'foo.rs')
                                let parent_dir_rs = parent_dir_relative.with_extension("rs");
                                let parent_dir_rs_id = parent_dir_rs.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

                                if src_path.join(&parent_mod_rs).exists() {
                                     log::trace!("  Found use dependency (super -> mod.rs): {} -> {}", current_file_id, parent_mod_rs_id);
                                     deps.insert(parent_mod_rs_id);
                                } else if src_path.join(&parent_dir_rs).exists() {
                                     log::trace!("  Found use dependency (super -> dir.rs): {} -> {}", current_file_id, parent_dir_rs_id);
                                     deps.insert(parent_dir_rs_id);
                                } else {
                                     log::warn!("Could not resolve 'use super;' in '{}' to a parent module file.", current_file_id);
                                }
                            }
                        } else {
                            // This happens if current_file_id is at the root (e.g., "main.rs" or "lib.rs")
                            // `super` doesn't make sense here in terms of file paths.
                            log::warn!("Encountered 'use super::' in root file '{}'. Ignoring.", current_file_id);
                        }
                        // --- End of super:: logic ---
                    }
                    "self" => {
                        // self:: refers to items in the *same* module.
                        // For file-level dependencies, this doesn't create an edge to a *different* file.
                        // We might need self:: later if we track item-level dependencies.
                        log::trace!("  Ignoring 'self::' path in file '{}' for file dependency graph.", current_file_id);
                    }
                    _ => {
                         // Potential external crate or unhandled path type
                         log::trace!("  Ignoring potential external crate or unhandled path starting with '{}' in file '{}'.", first_segment, current_file_id);
                    }
                 }
            }
            // Recursively check the rest of the path tree only if it's not self::
            // (No need to recurse inside self:: for file dependencies)
            if use_path.ident != "self" {
                 find_dependencies_in_use_tree(&*use_path.tree, deps, current_file_id, src_path);
            }
        }
        UseTree::Group(use_group) => {
            for item_tree in &use_group.items {
                find_dependencies_in_use_tree(item_tree, deps, current_file_id, src_path);
            }
        }
        UseTree::Name(_) => {} // End of path, ignore for file deps
        UseTree::Glob(_) => {
            log::trace!("  Ignoring glob import `*` in file '{}'.", current_file_id);
        }
        UseTree::Rename(_) => {
             log::trace!("  Ignoring rename import `as` for now in file '{}'.", current_file_id);
             // Potentially need to process the original tree here if syn doesn't handle it implicitly
        }
    }
}

// Helper to collect path segments (remains the same)
fn collect_path_segments(tree: &UseTree, segments: &mut Vec<String>) {
     match tree {
        UseTree::Path(use_path) => {
            segments.push(use_path.ident.to_string());
            collect_path_segments(&*use_path.tree, segments);
        }
        UseTree::Name(use_name) => {
             segments.push(use_name.ident.to_string());
        }
        _ => {}
     }
}