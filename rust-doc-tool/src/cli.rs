// src/cli.rs
use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(author, version, about = "Rust Documentation Tool for Whip Docs", long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,

    #[arg(short, long, action = clap::ArgAction::Count, global = true, help = "Increase verbosity level (e.g., -v, -vv)")]
    pub verbose: u8,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Manage tool configuration
    Config(ConfigArgs),
    /// Generate documentation data (Placeholder)
    Generate,
}

#[derive(Parser, Debug)]
pub struct ConfigArgs {
    #[command(subcommand)]
    pub command: ConfigCommands,
}

#[derive(Subcommand, Debug)]
pub enum ConfigCommands {
    /// Show the current configuration
    Show,
    /// Set the path to the Rust project repository interactively
    SetPath,
}