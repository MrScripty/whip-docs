// src/main.rs
mod cli;
mod config;
mod analyzer;

use anyhow::{Context, Result}; // Use anyhow for easy error handling in main
use clap::Parser;
use cli::{Cli, Commands, ConfigCommands};
use config::ConfigError;
use dialoguer::{theme::ColorfulTheme, Input};
use std::path::Path;
 // Import Write trait for writeln!

fn setup_logging(verbosity: u8) {
    let log_level = match verbosity {
        0 => log::LevelFilter::Warn,  // Default
        1 => log::LevelFilter::Info,  // -v
        2 => log::LevelFilter::Debug, // -vv
        _ => log::LevelFilter::Trace, // -vvv or more
    };

    env_logger::Builder::new()
        .filter_level(log_level)
        .format_timestamp_secs() // Optional: Add timestamps
        .init();
}

fn prompt_and_save_path() -> Result<()> {
    println!("Please provide the path to the Studio Whip Rust project repository.");
    let mut config = config::load_config().context("Failed to load existing configuration for update")?;

    let current_path = config.project_path.clone().unwrap_or_default();

    let new_path_str_raw: String = Input::with_theme(&ColorfulTheme::default())
        .with_prompt("Enter the absolute path")
        .default(current_path)
        .validate_with(|input: &String| -> Result<(), &str> {
            if input.trim().is_empty() {
                Err("Path cannot be empty.")
            } else {
                Ok(())
            }
        })
        .interact_text()
        .context("Failed to get path input from user")?;

    // --- Add trimming for quotes ---
    let new_path_str = new_path_str_raw.trim().trim_matches('"').to_string();
    // --- End of added trimming ---


    // Validate the *trimmed* entered path before saving
    // Expand tilde *after* trimming quotes
    let expanded_path_str = shellexpand::tilde(&new_path_str).to_string();
    let path_buf = std::path::PathBuf::from(expanded_path_str);

    if !path_buf.is_dir() {
        anyhow::bail!(
            "The provided path '{}' is not a valid directory. Configuration not saved.",
            path_buf.display() // Display the path we actually checked
        );
    }

    // Path is valid, save the cleaned path (without extra quotes)
    config.project_path = Some(new_path_str); // Save the cleaned string
    config::save_config(&config).context("Failed to save configuration")?;
    println!(
        "Project path set to: {}",
        config.project_path.as_deref().unwrap_or("<Error saving>")
    );
     println!(
        "Validated absolute path: {}",
        path_buf.display()
    );
    Ok(())
}

fn handle_config_command(config_cmd: ConfigCommands) -> Result<()> {
    match config_cmd {
        ConfigCommands::Show => {
            let config = config::load_config().context("Failed to load configuration")?;
            println!("Current Configuration:");
            println!(
                "  Project Path: {}",
                config
                    .project_path
                    .as_deref()
                    .unwrap_or("<Not Set>")
            );
             match config::get_validated_project_path(&config) {
                Ok(p) => println!("  Validated Path: {}", p.display()),
                Err(e) => match e {
                    ConfigError::ProjectPathNotSet => {} // Already handled above
                    ConfigError::InvalidProjectPath(p) => println!("  Validation Error: Path '{}' does not exist or is not a directory.", p.display()),
                    _ => println!("  Validation Error: {}", e), // Other config errors
                }
            }
        }
        ConfigCommands::SetPath => {
            // Directly call the prompting function
            prompt_and_save_path()?
        }
    }
    Ok(())
}

// --- Generates a relational graph of rust files ---
fn run_generation_logic(project_path: &Path) -> Result<()> { // Takes Path now
    let output_path_dir = config::ensure_output_dir_exists()
       .context("Failed to ensure output directory exists")?;
    let output_file_path = output_path_dir.join("module_graph.json");

   log::info!("Starting analysis of Rust project at: {}", project_path.display());

   // --- Call the analyzer ---
   match analyzer::analyze_project(project_path) {
       Ok(graph_data) => {
           log::info!(
               "Analysis successful. Found {} nodes and {} edges.",
               graph_data.nodes.len(),
               graph_data.edges.len()
           );

           // Serialize the graph data to JSON
           let json_output = serde_json::to_string_pretty(&graph_data)
               .context("Failed to serialize analysis results to JSON")?;

           // Write JSON to the output file
           std::fs::write(&output_file_path, json_output)
               .context(format!("Failed to write module graph JSON to '{}'", output_file_path.display()))?;

           log::info!("Successfully wrote module graph to: {}", output_file_path.display());
           println!("Generation complete. Output saved to: {}", output_file_path.display());
       }
       Err(e) => {
           // Analysis failed, report the error
           log::error!("Project analysis failed: {}", e);
           // Return an error using anyhow's context
           return Err(e).context("Project analysis failed");
       }
   }

   Ok(())
}

// --- Handle the generate command flow ---
fn handle_generate_command_with_prompting() -> Result<()> {
    println!("Attempting to generate documentation data...");

    // --- Loop until we have a valid path or an unrecoverable error ---
    loop {
        // Load config inside the loop in case it was just updated
        let config = config::load_config().context("Failed to load configuration")?;

        match config::get_validated_project_path(&config) {
            Ok(project_path) => {
                // Path is valid, proceed with actual generation and exit the loop
                log::info!("Project path validated. Proceeding with generation.");
                run_generation_logic(&project_path)?; // Call the actual logic
                return Ok(()); // Generation successful, exit function
            }
            Err(ConfigError::ProjectPathNotSet) => {
                println!("Project path is not configured.");
                // Try to prompt and save.
                match prompt_and_save_path() {
                    Ok(_) => {
                         println!("\nConfiguration updated. Retrying generation...");
                         // Loop will continue, reloading and re-validating config
                         continue;
                    }
                    Err(e) => {
                        // Prompting failed (e.g., user entered invalid path)
                        // Propagate the error from prompt_and_save_path
                        return Err(e).context("Failed to set project path during prompt");
                    }
                }
            }
            Err(ConfigError::InvalidProjectPath(invalid_path)) => {
                println!(
                    "The configured project path '{}' is invalid (not a directory or doesn't exist).",
                    invalid_path.display()
                );
                 // Try to prompt and save.
                 match prompt_and_save_path() {
                    Ok(_) => {
                         println!("\nConfiguration updated. Retrying generation...");
                         // Loop will continue, reloading and re-validating config
                         continue;
                    }
                    Err(e) => {
                        // Prompting failed (e.g., user entered invalid path)
                        // Propagate the error from prompt_and_save_path
                        return Err(e).context("Failed to set project path during prompt");
                    }
                }
            }
            Err(e) => {
                // Any other configuration error (like IO error during loading)
                // This is likely unrecoverable, so return the error.
                return Err(e).context("Failed to get validated project path");
            }
        }
    } // End of loop
}


fn main() -> Result<()> {
    // Ensure necessary directories exist early
    // If these fail, we probably can't proceed anyway.
    config::ensure_output_dir_exists().context("Failed to ensure output directory exists")?;
    config::ensure_dir_exists(config::CONFIG_DIR).context("Failed to ensure user config directory exists")?;

    let cli = Cli::parse();

    setup_logging(cli.verbose);

    log::debug!("CLI arguments parsed: {:?}", cli);
    log::info!("Executing command...");

    match cli.command {
        Commands::Config(config_args) => {
            handle_config_command(config_args.command)?
        }
        Commands::Generate => {
            // Use the new function that handles prompting
            handle_generate_command_with_prompting()?
        }
    }

    log::info!("Command finished successfully.");
    Ok(())
}
