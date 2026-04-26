#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod analyzer;
mod app_lifecycle;
mod app_setup;
mod commands;
mod config;
mod graph;
mod source;

fn main() {
    if let Err(error) = app_setup::run_app() {
        eprintln!("failed to start Whip Docs: {error}");
        std::process::exit(1);
    }
}
