use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use syn::{Item, UseTree};
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
    pub id: String,
    pub label: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct Edge {
    pub source: String,
    pub target: String,
}

#[derive(Serialize, Debug, Default)]
pub struct ModuleGraph {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

fn is_mod_file(file_id: &str) -> bool {
    Path::new(file_id).file_name() == Some(std::ffi::OsStr::new("mod.rs"))
    //let file_name = Path::new(file_id).file_name();
    //file_name == Some(std::ffi::OsStr::new("mod.rs")) ||
    //file_name == Some(std::ffi::OsStr::new("lib.rs"))
}

pub fn analyze_project(project_path: &Path) -> Result<ModuleGraph, AnalyzerError> {
    log::info!(
        "Starting analysis. Searching for 'src' directory within: {}",
        project_path.display()
    );

    let src_path_option = WalkDir::new(project_path)
        .max_depth(3)
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
    let mut direct_file_dependencies: HashMap<String, HashSet<String>> = HashMap::new();

    log::debug!("Pass 1: Discovering Rust files in {}...", src_path.display());
    for entry in WalkDir::new(&src_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "rs"))
    {
        let file_path = entry.path();
        let relative_path = file_path
            .strip_prefix(&src_path)
            .map_err(|_| AnalyzerError::PathStripError {
                prefix: src_path.clone(),
                path: file_path.to_path_buf(),
            })?;

        let file_id = relative_path
            .to_string_lossy()
            .replace(std::path::MAIN_SEPARATOR, "/");

        let label = file_path
            .file_name()
            .map_or_else(|| file_id.clone(), |name| name.to_string_lossy().into_owned());

        discovered_files_set.insert(file_id.clone());
        graph.nodes.push(Node {
            id: file_id,
            label,
        });
    }
    log::info!("Pass 1: Discovered {} Rust files.", graph.nodes.len());

    log::debug!("Pass 2: Parsing files and finding direct dependencies...");
    for node in &graph.nodes {
        let source_file_id = &node.id;
        let file_path = src_path.join(source_file_id.replace("/", std::path::MAIN_SEPARATOR_STR));

        let content = match fs::read_to_string(&file_path) {
            Ok(c) => c,
            Err(e) => {
                log::warn!("Could not read file {}: {}. Skipping for direct dep analysis.", file_path.display(), e);
                continue;
            }
        };
        let ast = match syn::parse_file(&content) {
            Ok(a) => a,
            Err(e) => {
                log::warn!("Could not parse file {}: {}. Skipping for direct dep analysis.", file_path.display(), e);
                continue;
            }
        };

        let current_direct_deps = direct_file_dependencies.entry(source_file_id.clone()).or_default();

        for item in ast.items {
            match item {
                Item::Use(item_use) => {
                    find_direct_dependencies_in_use_tree(
                        &item_use.tree,
                        current_direct_deps,
                        source_file_id,
                        &src_path,
                        &discovered_files_set,
                    );
                }
                Item::Mod(item_mod) => {
                    if item_mod.content.is_none() {
                        let mod_name = item_mod.ident.to_string();
                        let current_dir_relative = PathBuf::from(source_file_id)
                            .parent()
                            .unwrap_or_else(|| Path::new(""))
                            .to_path_buf();

                        let mod_file_rs_relative = current_dir_relative.join(format!("{}.rs", mod_name));
                        let mod_file_rs_id = mod_file_rs_relative.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

                        let mod_file_mod_rs_relative = current_dir_relative.join(&mod_name).join("mod.rs");
                        let mod_file_mod_rs_id = mod_file_mod_rs_relative.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

                        if discovered_files_set.contains(&mod_file_rs_id) {
                             current_direct_deps.insert(mod_file_rs_id);
                        } else if discovered_files_set.contains(&mod_file_mod_rs_id) {
                             current_direct_deps.insert(mod_file_mod_rs_id);
                        } else {
                            log::warn!("Could not resolve 'mod {};' in file '{}' to an existing file relative to src.", mod_name, source_file_id);
                        }
                    }
                }
                _ => {}
            }
        }
    }

    log::debug!("Pass 3: Resolving effective dependencies and creating final edges...");
    let mut final_edges_set: HashSet<(String, String)> = HashSet::new();

    for initial_source_id in &discovered_files_set {
        if is_mod_file(initial_source_id) {
            continue;
        }

        if let Some(direct_targets) = direct_file_dependencies.get(initial_source_id) {
            for direct_target_id in direct_targets {
                let mut queue: VecDeque<String> = VecDeque::new();
                queue.push_back(direct_target_id.clone());

                let mut visited_in_bfs: HashSet<String> = HashSet::new();
                visited_in_bfs.insert(initial_source_id.clone());

                while let Some(current_bfs_node_id) = queue.pop_front() {
                    if !visited_in_bfs.insert(current_bfs_node_id.clone()) {
                        continue;
                    }

                    if is_mod_file(&current_bfs_node_id) {
                        if let Some(dependencies_of_mod_file) = direct_file_dependencies.get(&current_bfs_node_id) {
                            for deeper_dependency_id in dependencies_of_mod_file {
                                if *initial_source_id != *deeper_dependency_id {
                                     queue.push_back(deeper_dependency_id.clone());
                                }
                            }
                        }
                    } else {
                        if *initial_source_id != current_bfs_node_id {
                            log::trace!("Adding effective edge: {} -> {}", initial_source_id, current_bfs_node_id);
                            final_edges_set.insert((initial_source_id.clone(), current_bfs_node_id.clone()));
                        }
                    }
                }
            }
        }
    }

    graph.edges = final_edges_set
        .into_iter()
        .map(|(s, t)| Edge { source: s, target: t })
        .collect();

    log::info!("Pass 3: Created {} final edges.", graph.edges.len());
    log::info!("Analysis complete.");
    Ok(graph)
}

fn find_direct_dependencies_in_use_tree(
    tree: &UseTree,
    deps: &mut HashSet<String>,
    current_file_id: &str,
    _src_path: &Path,
    discovered_files: &HashSet<String>,
) {
    match tree {
        UseTree::Path(use_path) => {
            let mut path_segments = vec![use_path.ident.to_string()];
            collect_path_segments_for_use(&*use_path.tree, &mut path_segments);

            let base_path_to_resolve = match path_segments.first().map(|s| s.as_str()) {
                Some("crate") => {
                    if path_segments.len() > 1 {
                        PathBuf::from(path_segments[1..path_segments.len()-1].join(std::path::MAIN_SEPARATOR_STR))
                    } else { return; }
                }
                Some("super") => {
                    let current_as_path = PathBuf::from(current_file_id.replace("/",std::path::MAIN_SEPARATOR_STR));
                    if let Some(parent) = current_as_path.parent() {
                        if path_segments.len() > 1 {
                            parent.join(path_segments[1..path_segments.len()-1].join(std::path::MAIN_SEPARATOR_STR))
                        } else {
                            parent.to_path_buf()
                        }
                    } else { return; }
                }
                Some("self") => {
                    let current_dir = PathBuf::from(current_file_id.replace("/",std::path::MAIN_SEPARATOR_STR))
                                        .parent().unwrap_or_else(|| Path::new("")).to_path_buf();
                    if path_segments.len() > 1 {
                        current_dir.join(path_segments[1..path_segments.len()-1].join(std::path::MAIN_SEPARATOR_STR))
                    } else { return; }
                }
                Some(_first_segment_name) => {
                    let current_dir = PathBuf::from(current_file_id.replace("/",std::path::MAIN_SEPARATOR_STR))
                                        .parent().unwrap_or_else(|| Path::new("")).to_path_buf();
                    if path_segments.len() > 0 && path_segments.len()-1 > 0 && !path_segments[..path_segments.len()-1].is_empty() {
                         current_dir.join(path_segments[..path_segments.len()-1].join(std::path::MAIN_SEPARATOR_STR))
                    } else if path_segments.len() == 1 { // e.g. use foo; (referring to foo.rs or foo/mod.rs)
                        current_dir.join(path_segments[0].clone())
                    }
                     else { return; }
                }
                None => return,
            };

            if base_path_to_resolve.as_os_str().is_empty() && path_segments.len() == 1 {
                if path_segments.first().map(|s| s.as_str()) == Some("super") {
                    let current_as_path = PathBuf::from(current_file_id.replace("/",std::path::MAIN_SEPARATOR_STR));
                    if let Some(parent_dir) = current_as_path.parent() {
                        let parent_mod_rs_id = parent_dir.join("mod.rs").to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
                        let parent_file_rs_id = parent_dir.with_extension("rs").to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
                        if discovered_files.contains(&parent_mod_rs_id) { deps.insert(parent_mod_rs_id); return; }
                        if discovered_files.contains(&parent_file_rs_id) { deps.insert(parent_file_rs_id); return; }
                    }
                }
                return;
            }

            let target_rs_id = base_path_to_resolve.with_extension("rs").to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
            let target_mod_rs_id = base_path_to_resolve.join("mod.rs").to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

            if discovered_files.contains(&target_rs_id) {
                deps.insert(target_rs_id);
            } else if discovered_files.contains(&target_mod_rs_id) {
                deps.insert(target_mod_rs_id);
            } else {
                if base_path_to_resolve.components().count() > 0 {
                    if let Some(parent_of_item_path) = base_path_to_resolve.parent() {
                        if !parent_of_item_path.as_os_str().is_empty() || base_path_to_resolve.components().count() > 1 {
                             let parent_as_file_rs_id = parent_of_item_path.with_extension("rs")
                                .to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
                            let parent_as_dir_mod_rs_id = parent_of_item_path.join("mod.rs")
                                .to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");

                            if discovered_files.contains(&parent_as_file_rs_id) {
                                deps.insert(parent_as_file_rs_id);
                            } else if discovered_files.contains(&parent_as_dir_mod_rs_id) {
                                deps.insert(parent_as_dir_mod_rs_id);
                            }
                        }
                    }
                }
            }
        }
        UseTree::Group(use_group) => {
            for item_tree in &use_group.items {
                find_direct_dependencies_in_use_tree(item_tree, deps, current_file_id, _src_path, discovered_files);
            }
        }
        UseTree::Name(_) | UseTree::Glob(_) | UseTree::Rename(_) => {}
    }
}

fn collect_path_segments_for_use(tree: &UseTree, segments: &mut Vec<String>) {
     match tree {
        UseTree::Path(use_path) => {
            segments.push(use_path.ident.to_string());
            collect_path_segments_for_use(&*use_path.tree, segments);
        }
        UseTree::Name(use_name) => {
             segments.push(use_name.ident.to_string());
        }
        UseTree::Group(_) | UseTree::Glob(_) | UseTree::Rename(_) => {}
     }
}