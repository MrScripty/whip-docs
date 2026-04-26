use std::sync::Arc;

use tauri::{Manager, RunEvent};

use crate::app_lifecycle;
use crate::commands::{self, AppState};
use crate::config::ConfigStore;

type AppStartupResult<T> = Result<T, Box<dyn std::error::Error>>;

pub fn run_app() -> AppStartupResult<()> {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().map_err(|error| {
                startup_error(format!("failed to resolve app data directory: {error}"))
            })?;
            let config_store = ConfigStore::new(app_data_dir);
            let config =
                tauri::async_runtime::block_on(async { config_store.load_or_default().await })
                    .map_err(|error| startup_error(error.to_string()))?;
            app.manage(std::sync::Arc::new(AppState::new(config_store, config)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_status,
            commands::get_app_config,
            commands::get_analysis_status,
            commands::analyze_source_repo,
            commands::get_graph_snapshot,
            commands::get_source_snippet,
            commands::set_source_repo_path
        ])
        .build(tauri::generate_context!())?
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app_handle.try_state::<Arc<AppState>>() {
                    app_lifecycle::request_shutdown(state.inner());
                }
            }
        });

    Ok(())
}

fn startup_error(message: impl Into<String>) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::other(message.into()))
}
