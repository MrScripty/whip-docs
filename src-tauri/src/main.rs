#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_lifecycle;
mod app_setup;
use whip_docs::{commands, config};

fn main() {
    if let Err(error) = app_setup::run_app() {
        eprintln!("failed to start Whip Docs: {error}");
        std::process::exit(1);
    }
}
